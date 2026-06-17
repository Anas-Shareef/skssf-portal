<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Loan;
use App\Models\PortalConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class LoanController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $status = $request->query('status');
        $user = auth()->user();
        $query = Loan::query()->latest('id');

        // Security Scoping
        if ($user->role === 'member') {
            $query->where('user_id', $user->id);
        } elseif ($user->role === 'admin') {
            $query->where('branch', $user->branch);
        }

        if ($status) {
            $query->where('status', $status);
        }

        return response()->json(['data' => $query->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
            'member_no' => ['nullable', 'string', 'max:255'],
            'name' => ['required', 'string', 'max:255'],
            'branch' => ['nullable', 'string', 'max:255'],
            'mob' => ['nullable', 'string', 'max:50'],
            'amount' => ['required', 'numeric', 'min:1'],
            'purpose' => ['required', 'string', 'max:255'],
            'purpose_desc' => ['nullable', 'string'],
            'months' => ['required', 'integer', 'min:1'],
            'guarantors' => ['nullable', 'array'],
            'repayments' => ['nullable', 'array'],
            'signature' => ['nullable', 'string'],
            'witnesses' => ['nullable', 'array'],
        ]);

        $config = $this->portalConfig();
        $loanNo = 'LOAN-'.now()->year.'-'.str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT);
        $user = auth()->user();

        $loan = Loan::query()->create([
            ...$payload,
            'user_id' => $payload['user_id'] ?? $user->id,
            'member_no' => $payload['member_no'] ?? $user->member_no,
            'branch' => $payload['branch'] ?? $user->branch,
            'mob' => $payload['mob'] ?? $user->phone,
            'loan_no' => $loanNo,
            'status' => 'pending',
            'submitted_date' => now()->toDateString(),
            'request' => [
                'submittedAt' => now()->toIso8601String(),
                'approvals' => [],
                'assignedReviewers' => $config->default_committee ?? [],
                'threshold' => $config->loan_approvals_needed ?? 2,
                'status' => 'pending',
            ],
            'audit' => [[
                'action' => 'Submitted',
                'by' => $payload['name'],
                'date' => now()->toDateTimeString(),
                'note' => 'Application generated.',
                'category' => 'loan',
            ]],
            'repayments' => $payload['repayments'] ?? [],
            'guarantors' => $payload['guarantors'] ?? [],
            'signature' => $payload['signature'] ?? null,
            'witnesses' => $payload['witnesses'] ?? [],
        ]);

        return response()->json(['data' => $loan], 201);
    }

    public function update(Request $request, Loan $loan): JsonResponse
    {
        $payload = $request->validate([
            'status' => ['sometimes', Rule::in(['pending', 'approved', 'rejected', 'completed'])],
            'amount' => ['sometimes', 'numeric', 'min:1'],
            'purpose' => ['sometimes', 'string', 'max:255'],
            'purpose_desc' => ['sometimes', 'nullable', 'string'],
            'months' => ['sometimes', 'integer', 'min:1'],
            'repayments' => ['sometimes', 'array'],
            'guarantors' => ['sometimes', 'array'],
            'audit' => ['sometimes', 'array'],
            'admin_note' => ['sometimes', 'nullable', 'string'],
            'super_note' => ['sometimes', 'nullable', 'string'],
            'approved_by' => ['sometimes', 'nullable', 'string'],
            'approved_date' => ['sometimes', 'nullable', 'date'],
            'disbursed_date' => ['sometimes', 'nullable', 'date'],
            'signature' => ['sometimes', 'nullable', 'string'],
            'witnesses' => ['sometimes', 'nullable', 'array'],
            'request' => ['sometimes', 'nullable', 'array'],
        ]);

        // Merge request field instead of overwriting, to preserve existing approvals
        if (isset($payload['request'])) {
            $existingRequest = $loan->request ?? [];
            $payload['request'] = array_merge($existingRequest, $payload['request']);
        }

        $loan->fill($payload);
        $loan->save();

        return response()->json(['data' => $loan]);
    }

    public function verify(Request $request, Loan $loan): JsonResponse
    {
        $payload = $request->validate([
            'status' => ['required', Rule::in(['approved', 'rejected', 'pending'])],
            'adminNotes' => ['nullable', 'string'],
            'adminBy' => ['nullable', 'string', 'max:255'],
            'adminRole' => ['nullable', Rule::in(['super', 'admin'])],
            'adminId' => ['nullable', 'string', 'exists:users,code'],
        ]);

        $approval = $this->buildSignature($payload);
        $requestState = $loan->request ?? [];
        $requestState['approvals'] = $requestState['approvals'] ?? [];
        $requestState['threshold'] = $requestState['threshold'] ?? 2;

        $requestState['approvals'] = $this->upsertApproval($requestState['approvals'], $approval);
        $consensus = $this->resolveConsensus($requestState['approvals'], (int) $requestState['threshold']);

        $requestState['status'] = $consensus['status'];
        $loan->request = $requestState;
        $loan->status = $consensus['loan_status'];
        if ($consensus['loan_status'] === 'approved') {
            $loan->approved_date = now()->toDateString();
        }

        $audit = $loan->audit ?? [];
        $audit[] = [
            'action' => $payload['status'] === 'approved' ? 'Loan Verified' : ($payload['status'] === 'rejected' ? 'Loan Rejected' : 'Loan Deliberation'),
            'by' => $approval['by'],
            'date' => now()->toDateTimeString(),
            'note' => $payload['adminNotes'] ?? '',
            'category' => 'loan',
        ];
        $loan->audit = $audit;
        $loan->save();

        return response()->json(['data' => $loan]);
    }

    public function bulkDelete(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['required'],
        ]);

        $ids = array_map('strval', $payload['ids']);
        Loan::query()
            ->whereIn('loan_no', $ids)
            ->delete();

        return response()->json(['message' => 'Deleted']);
    }

    public function submitRepayment(Request $request, Loan $loan, int $month): JsonResponse
    {
        $payload = $request->validate([
            'proof' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
            'amt' => ['required', 'numeric', 'min:1'],
            'mode' => ['required', Rule::in(['cash', 'transfer'])],
            'ref' => ['nullable', 'string', 'max:255'],
            'payDate' => ['nullable', 'date'],
            'memberNote' => ['nullable', 'string'],
            'isFullClearance' => ['nullable', 'boolean'],
            'assignedReviewers' => ['nullable', 'array'],
        ]);

        $repayments = $loan->repayments ?? [];
        if (!isset($repayments[$month])) {
            return response()->json(['message' => 'Repayment month index invalid'], 422);
        }

        // Calculate remaining balance to validate isFullClearance
        $isFullClearance = filter_var($payload['isFullClearance'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if ($isFullClearance) {
            $totalPaid = collect($repayments)->reduce(fn ($acc, $r) => $acc + (!empty($r['paid']) ? (float) ($r['paid_amount'] ?? ($r['request']['amt'] ?? $r['amt'])) : 0), 0);
            $remainingBalance = (float) $loan->amount - $totalPaid;
            if ((float) $payload['amt'] < $remainingBalance - 10.0) {
                $isFullClearance = false;
            }
        }

        $config = $this->portalConfig();
        $requestPayload = $payload;
        $requestPayload['isFullClearance'] = $isFullClearance;

        $repayments[$month]['request'] = [
            ...$requestPayload,
            'installment_no' => $month + 1,
            'submittedAt' => now()->toIso8601String(),
            'status' => 'pending',
            'approvals' => [],
            'assignedReviewers' => $payload['assignedReviewers'] ?? ($config->default_committee ?? []),
        ];
        $loan->repayments = $repayments;

        $audit = $loan->audit ?? [];
        $audit[] = [
            'action' => 'Payment Proof Submitted',
            'by' => 'Member',
            'date' => now()->toDateTimeString(),
            'note' => 'Member submitted proof for EMI #'.($month + 1),
            'category' => 'repayment',
        ];
        $loan->audit = $audit;
        $loan->save();

        return response()->json(['data' => $loan]);
    }

    public function verifyRepayment(Request $request, Loan $loan, int $month): JsonResponse
    {
        $payload = $request->validate([
            'status' => ['required', Rule::in(['approved', 'rejected', 'pending'])],
            'adminNotes' => ['nullable', 'string'],
            'adminBy' => ['nullable', 'string', 'max:255'],
            'adminRole' => ['nullable', Rule::in(['super', 'admin'])],
            'adminId' => ['nullable', 'string', 'exists:users,code'],
        ]);

        $repayments = $loan->repayments ?? [];
        if (!isset($repayments[$month]['request'])) {
            return response()->json(['message' => 'Repayment request not found'], 422);
        }

        $signature = $this->buildSignature($payload);
        $requestState = $repayments[$month]['request'];
        $requestState['approvals'] = $requestState['approvals'] ?? [];
        $requestState['approvals'] = $this->upsertApproval($requestState['approvals'], $signature);

        $config = $this->portalConfig();
        $threshold = (int) ($config->repayment_approvals_needed ?? 1);
        $decision = $this->resolveConsensus($requestState['approvals'], $threshold, true);
        $requestState['status'] = $decision['status'];
        $requestState['reviewedAt'] = now()->toIso8601String();
        $repayments[$month]['request'] = $requestState;

        if ($decision['status'] === 'approved') {
            $repayments[$month]['paid'] = now()->toDateString();
            $repayments[$month]['paid_date'] = now()->format('d/m/Y');
            $repayments[$month]['method'] = $requestState['mode'] ?? 'transfer';
            $repayments[$month]['notes'] = $payload['adminNotes'] ?? ($requestState['memberNote'] ?? '');
            $repayments[$month]['proof'] = $requestState['proof'] ?? '';

            // Handle Full Clearance if requested
            $isFullClearance = filter_var($requestState['isFullClearance'] ?? false, FILTER_VALIDATE_BOOLEAN);
            if ($isFullClearance) {
                // Double check if the amount covers the remaining balance
                $totalPaidExcludingCurrent = collect($repayments)->reduce(function ($acc, $r) use ($month, $repayments) {
                    if (empty($r['paid']) || $r === $repayments[$month]) {
                        return $acc;
                    }
                    return $acc + (float) ($r['paid_amount'] ?? ($r['request']['amt'] ?? $r['amt']));
                }, 0);
                $remainingBalance = (float) $loan->amount - $totalPaidExcludingCurrent;
                $approvedAmt = (float) ($requestState['amt'] ?? $repayments[$month]['amt']);
                if ($approvedAmt >= $remainingBalance - 10.0) {
                    foreach ($repayments as &$rep) {
                        if (empty($rep['paid'])) {
                            $rep['paid'] = now()->toDateString();
                            $rep['paid_date'] = now()->format('d/m/Y');
                            $rep['method'] = $requestState['mode'] ?? 'transfer';
                            $rep['notes'] = ($requestState['memberNote'] ?? '') . ' (Full Clearance Approved)';
                            $rep['proof'] = $requestState['proof'] ?? '';
                        }
                    }
                    unset($rep);
                }
            }
        }

        $loan->repayments = $repayments;
        $loan->status = collect($repayments)->every(fn ($r) => !empty($r['paid'])) ? 'completed' : $loan->status;

        $audit = $loan->audit ?? [];
        $audit[] = [
            'action' => $payload['status'] === 'approved' ? 'Payment Verified' : ($payload['status'] === 'rejected' ? 'Payment Rejected' : 'Payment Deliberation'),
            'by' => $signature['by'],
            'date' => now()->toDateTimeString(),
            'note' => $payload['adminNotes'] ?? '',
            'category' => 'repayment',
        ];
        $loan->audit = $audit;
        $loan->save();

        return response()->json(['data' => $loan]);
    }

    public function logRepayment(Request $request, Loan $loan, int $month): JsonResponse
    {
        $payload = $request->validate([
            'method' => ['required', Rule::in(['cash', 'transfer'])],
            'notes' => ['nullable', 'string'],
            'proof' => ['nullable', 'string'],
            'amt' => ['nullable', 'numeric', 'min:1'],
            'isFullClearance' => ['nullable', 'boolean'],
        ]);

        $repayments = $loan->repayments ?? [];
        if (!isset($repayments[$month])) {
            return response()->json(['message' => 'Repayment month index invalid'], 422);
        }

        $isFullClearance = filter_var($payload['isFullClearance'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if ($isFullClearance) {
            // Double check if the amount covers the remaining balance
            $totalPaid = collect($repayments)->reduce(fn ($acc, $r) => $acc + (!empty($r['paid']) ? (float) ($r['paid_amount'] ?? ($r['request']['amt'] ?? $r['amt'])) : 0), 0);
            $remainingBalance = (float) $loan->amount - $totalPaid;
            $loggedAmt = (float) ($payload['amt'] ?? $repayments[$month]['amt']);
            if ($loggedAmt >= $remainingBalance - 10.0) {
                foreach ($repayments as &$repayment) {
                    if (empty($repayment['paid'])) {
                        $repayment['paid'] = now()->toDateString();
                        $repayment['paid_date'] = now()->format('d/m/Y');
                        $repayment['method'] = $payload['method'];
                        $repayment['notes'] = trim((string) (($repayment['notes'] ?? '').' (Full Settlement Logged)'));
                        $repayment['proof'] = $payload['proof'] ?? '';
                    }
                }
                unset($repayment);
            } else {
                $isFullClearance = false;
            }
        }

        if (!$isFullClearance) {
            $repayments[$month]['paid'] = now()->toDateString();
            $repayments[$month]['paid_date'] = now()->format('d/m/Y');
            $repayments[$month]['method'] = $payload['method'];
            $repayments[$month]['notes'] = $payload['notes'] ?? '';
            $repayments[$month]['proof'] = $payload['proof'] ?? '';
            $repayments[$month]['paid_amount'] = (float) ($payload['amt'] ?? $repayments[$month]['amt']);
        }

        $loan->repayments = $repayments;
        if (collect($repayments)->every(fn ($r) => !empty($r['paid']))) {
            $loan->status = 'completed';
        }

        $audit = $loan->audit ?? [];
        $audit[] = [
            'action' => $isFullClearance ? 'Full Loan Settlement Logged' : 'Repayment Logged',
            'by' => 'Admin',
            'date' => now()->toDateTimeString(),
            'note' => $isFullClearance ? 'All remaining installments cleared manually.' : 'EMI #'.($month + 1).' marked as paid.',
            'category' => 'repayment',
        ];
        $loan->audit = $audit;
        $loan->save();

        return response()->json(['data' => $loan]);
    }

    private function buildSignature(array $payload): array
    {
        return [
            'id' => $payload['adminId'] ?? null,
            'by' => $payload['adminBy'] ?? 'Admin',
            'role' => $payload['adminRole'] ?? 'admin',
            'date' => now()->toIso8601String(),
            'note' => $payload['adminNotes'] ?? '',
            'status' => $payload['status'],
        ];
    }

    private function upsertApproval(array $approvals, array $signature): array
    {
        foreach ($approvals as $index => $approval) {
            if (($signature['id'] && ($approval['id'] ?? null) === $signature['id']) || ($approval['by'] ?? null) === $signature['by']) {
                $approvals[$index] = $signature;
                return $approvals;
            }
        }

        $approvals[] = $signature;
        return $approvals;
    }

    private function resolveConsensus(array $approvals, int $threshold, bool $isRepayment = false): array
    {
        $approved = array_values(array_filter($approvals, fn ($a) => ($a['status'] ?? '') === 'approved'));
        $rejected = array_values(array_filter($approvals, fn ($a) => ($a['status'] ?? '') === 'rejected'));
        $superApproved = collect($approved)->contains(fn ($a) => ($a['role'] ?? '') === 'super');

        if ($superApproved || count($approved) >= $threshold) {
            return [
                'status' => 'approved',
                'loan_status' => 'approved',
            ];
        }

        if (count($rejected) > 0) {
            return [
                'status' => 'rejected',
                'loan_status' => 'rejected',
            ];
        }

        if (count($approved) > 0) {
            return [
                'status' => 'partially_approved',
                'loan_status' => 'pending',
            ];
        }

        return [
            'status' => 'pending',
                'loan_status' => 'pending',
            ];
        }

    private function ensureOtpTableExists(): void
    {
        if (!Schema::hasTable('witness_otps')) {
            Schema::create('witness_otps', function (\Illuminate\Database\Schema\Blueprint $table) {
                $table->id();
                $table->string('email')->index();
                $table->string('phone')->nullable()->index();
                $table->string('code');
                $table->dateTime('expires_at');
                $table->timestamps();
            });
        } else {
            if (!Schema::hasColumn('witness_otps', 'email')) {
                try {
                    Schema::table('witness_otps', function (\Illuminate\Database\Schema\Blueprint $table) {
                        $table->string('email')->nullable()->index();
                    });
                } catch (\Exception $e) {
                    \Illuminate\Support\Facades\Log::error("Failed to add email column: " . $e->getMessage());
                }
            }

            // Make phone column nullable on existing tables to avoid 1364 errors in MySQL
            try {
                if (DB::getDriverName() === 'mysql') {
                    DB::statement("ALTER TABLE witness_otps MODIFY phone VARCHAR(255) NULL");
                } else {
                    Schema::table('witness_otps', function (\Illuminate\Database\Schema\Blueprint $table) {
                        $table->string('phone')->nullable()->change();
                    });
                }
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::error("Failed to make phone column nullable: " . $e->getMessage());
            }
        }
    }

    public function sendOtp(Request $request): JsonResponse
    {
        try {
            $payload = $request->validate([
                'email' => ['required', 'email', 'max:255'],
                'name' => ['required', 'string', 'max:255'],
            ]);

            $email = $payload['email'];
            $name = $payload['name'];

            $this->ensureOtpTableExists();

            // Clean up any old/expired OTPs first
            try {
                DB::table('witness_otps')->where('expires_at', '<', now())->delete();
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::error("Failed to clean up expired OTPs: " . $e->getMessage());
            }

            // Generate 6-digit code
            $otp = (string) random_int(100000, 999999);

            // Store OTP in database, updating if this email already has an active record
            $existing = DB::table('witness_otps')->where('email', $email)->first();
            if ($existing) {
                DB::table('witness_otps')
                    ->where('email', $email)
                    ->update([
                        'code' => $otp,
                        'expires_at' => now()->addMinutes(10),
                        'updated_at' => now()
                    ]);
            } else {
                DB::table('witness_otps')
                    ->insert([
                        'email' => $email,
                        'code' => $otp,
                        'expires_at' => now()->addMinutes(10),
                        'created_at' => now(),
                        'updated_at' => now()
                    ]);
            }

            // Send Email OTP via Laravel Mail facade
            try {
                \Illuminate\Support\Facades\Mail::raw(
                    "Hello {$name},\n\nYour OTP code for verifying your signature as a witness is: {$otp}\n\nThis code will expire in 10 minutes.\n\nThank you,\nSKSSF Poyanad Branch",
                    function ($message) use ($email, $name) {
                        $message->to($email, $name)
                                ->subject('SKSSF Loan - Witness OTP Verification');
                    }
                );
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::error("Failed to send OTP email to {$email}: " . $e->getMessage());
            }

            // Log the OTP (for dev / audit trail)
            \Illuminate\Support\Facades\Log::info("OTP sent to witness {$name} ({$email}): {$otp}");

            $responseData = [
                'success' => true,
                'message' => 'OTP sent successfully to ' . $email,
            ];

            if (config('app.env') !== 'production') {
                $responseData['otp'] = $otp;
            }

            return response()->json($responseData);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error("sendOtp Exception: " . $e->getMessage() . "\n" . $e->getTraceAsString());
            return response()->json([
                'success' => false,
                'message' => 'Server Error: ' . $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ], 500);
        }
    }

    public function verifyOtp(Request $request): JsonResponse
    {
        try {
            $payload = $request->validate([
                'email' => ['required', 'email', 'max:255'],
                'code' => ['required', 'string', 'size:6'],
            ]);

            $email = $payload['email'];
            $code = $payload['code'];

            $this->ensureOtpTableExists();

            $otpRecord = DB::table('witness_otps')
                ->where('email', $email)
                ->where('code', $code)
                ->where('expires_at', '>', now())
                ->first();

            if (!$otpRecord) {
                return response()->json([
                    'success' => false,
                    'message' => 'The entered OTP code is invalid or has expired.'
                ], 422);
            }

            // Clear OTP after successful verification
            DB::table('witness_otps')
                ->where('email', $email)
                ->delete();

            return response()->json([
                'success' => true,
                'message' => 'OTP verified successfully.'
            ]);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error("verifyOtp Exception: " . $e->getMessage() . "\n" . $e->getTraceAsString());
            return response()->json([
                'success' => false,
                'message' => 'Server Error: ' . $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ], 500);
        }
    }

    private function portalConfig(): PortalConfig
    {
        return PortalConfig::query()->firstOrCreate([], [
            'org_name' => 'SKSSF Poyanad Branch',
            'org_logo' => '',
            'org_scale' => 1.0,
            'max_loan' => 50000,
            'sah_amt' => 100,
            'repayment_approvals_needed' => 1,
            'loan_approvals_needed' => 2,
            'approver_roles' => ['President', 'Secretary', 'Treasurer'],
            'authorized_reviewers' => [],
            'default_committee' => [],
        ]);
    }
}
