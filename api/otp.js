import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const action = req.query.action || req.body.action;
  if (!action) {
    return res.status(400).json({ message: 'Action parameter required (send or verify)' });
  }

  // ==========================================
  // ACTION: SEND OTP
  // ==========================================
  if (action === 'send') {
    const { email, name, applicantName, applicantEmail } = req.body;
    if (!email || !name) {
      return res.status(400).json({ message: 'Email and name are required' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes from now

    try {
      // 1. Store OTP in Supabase table
      const { error: dbError } = await supabase.from('witness_otps').insert({
        email: email.trim().toLowerCase(),
        code: otp,
        expires_at: expiresAt
      });

      if (dbError) {
        console.error('Database Error:', dbError);
        return res.status(500).json({ message: 'Database error occurred: ' + dbError.message });
      }

      // 2. Send email via SMTP
      const mailHost = process.env.MAIL_HOST;
      const mailPort = parseInt(process.env.MAIL_PORT || '587');
      const mailUser = process.env.MAIL_USERNAME;
      const mailPass = process.env.MAIL_PASSWORD;
      const mailFrom = process.env.MAIL_FROM_ADDRESS || 'noreply@skssf-portal.com';

      if (!mailHost || !mailUser || !mailPass) {
        console.warn('SMTP configuration is missing. Logging OTP to server console.');
        console.log(`[DEV/DEBUG] OTP for ${email}: ${otp}`);
        return res.status(200).json({ 
          success: true, 
          message: 'OTP logged to server console (SMTP credentials missing on Render/Vercel env)' 
        });
      }

      const transporter = nodemailer.createTransport({
        host: mailHost,
        port: mailPort,
        secure: mailPort === 465,
        auth: {
          user: mailUser,
          pass: mailPass,
        },
      });

      const nominationText = applicantName && applicantEmail
        ? `You have been nominated as a witness for a loan application from ${applicantName} from his email : ${applicantEmail} on the SKSSF Poyanad Branch Portal.`
        : `You have been nominated as a witness for a loan application on the SKSSF Poyanad Branch Portal.`;

      await transporter.sendMail({
        from: `"SKSSF Portal" <${mailFrom}>`,
        to: email.trim(),
        subject: 'SKSSF Loan - Witness OTP Verification',
        text: `Hello ${name},\n\n${nominationText}\n\nYour OTP code for verifying your signature as a witness is: ${otp}\n\nThis code will expire in 10 minutes.\n\nThank you,\nSKSSF Poyanad Branch`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
            <h2 style="color: #047857;">SKSSF Loan Witness Verification</h2>
            <p>Hello <strong>${name}</strong>,</p>
            <p>${nominationText}</p>
            <p>Your one-time verification code (OTP) is:</p>
            <div style="background: #f0fdf4; border: 1px solid #10b981; padding: 15px; font-size: 24px; font-weight: bold; letter-spacing: 5px; text-align: center; color: #047857; margin: 20px 0; border-radius: 8px;">
              ${otp}
            </div>
            <p>This code will expire in 10 minutes.</p>
            <p>If you did not request this, please ignore this email.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 11px; color: #666;">This is an automated email from the SKSSF Poyanad Branch Portal.</p>
          </div>
        `
      });

      return res.status(200).json({ success: true, message: 'OTP sent to email inbox' });
    } catch (error) {
      console.error('Send OTP Error:', error);
      return res.status(500).json({ message: error.message || 'Failed to send OTP email' });
    }
  }

  // ==========================================
  // ACTION: VERIFY OTP
  // ==========================================
  if (action === 'verify') {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ message: 'Email and code are required' });
    }

    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanCode = code.trim();

      // Find the latest valid OTP code for this email that has not expired
      const { data: otps, error: dbError } = await supabase
        .from('witness_otps')
        .select('*')
        .eq('email', cleanEmail)
        .eq('code', cleanCode)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (dbError) {
        console.error('Database Error:', dbError);
        return res.status(500).json({ message: 'Database error occurred: ' + dbError.message });
      }

      if (!otps || otps.length === 0) {
        return res.status(400).json({ message: 'Invalid or expired OTP code' });
      }

      // OTP is valid! Delete all OTPs for this email to prevent reuse
      await supabase.from('witness_otps').delete().eq('email', cleanEmail);

      return res.status(200).json({ success: true, message: 'OTP verified successfully' });
    } catch (error) {
      console.error('Verify OTP Error:', error);
      return res.status(500).json({ message: error.message || 'Failed to verify OTP' });
    }
  }

  return res.status(400).json({ message: 'Invalid action' });
}
