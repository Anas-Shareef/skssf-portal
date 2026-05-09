<?php

namespace Database\Seeders;

use App\Models\Loan;
use App\Models\PortalConfig;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class SkssfSeeder extends Seeder
{
    public function run(): void
    {
        $super = User::query()->create([
            'code' => 'S001',
            'role' => 'super',
            'name' => 'Super Admin',
            'email' => 'admin@skssf.org',
            'phone' => '9000000000',
            'branch' => 'Poyanad Central',
            'designation' => 'Super Admin',
            'active' => true,
            'join_date' => now()->toDateString(),
            'sahachari_paid' => [],
            'sah_miss' => [],
            'total_donated' => 0,
            'password' => Hash::make('admin123'),
            'is_approver' => true,
        ]);

        User::query()->create([
            'code' => 'A001',
            'role' => 'admin',
            'name' => 'Mohammed Ashraf',
            'email' => 'president@skssf.org',
            'phone' => '9876543210',
            'branch' => 'Poyanad Central',
            'designation' => 'President',
            'active' => true,
            'join_date' => now()->toDateString(),
            'sahachari_paid' => [],
            'sah_miss' => [],
            'total_donated' => 0,
            'password' => Hash::make('pres2025'),
            'is_approver' => true,
        ]);

        $member = User::query()->create([
            'code' => 'M001',
            'role' => 'member',
            'member_no' => 'SKSSF-2024-1042',
            'name' => 'Faris Abdulrahman',
            'email' => 'faris@gmail.com',
            'phone' => '9876567890',
            'branch' => 'Poyanad Central',
            'occupation' => 'Teacher',
            'active' => true,
            'join_date' => '2023-01-15',
            'sahachari_paid' => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            'sah_miss' => [],
            'total_donated' => 3500,
            'password' => Hash::make('member123'),
            'is_approver' => false,
        ]);

        PortalConfig::query()->create([
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

        Loan::query()->create([
            'loan_no' => 'LOAN-'.now()->year.'-0001',
            'user_id' => $member->id,
            'member_no' => $member->member_no,
            'name' => $member->name,
            'branch' => $member->branch,
            'mob' => $member->phone,
            'amount' => 15000,
            'purpose' => 'Education Fees',
            'purpose_desc' => 'College fee payment for B.Ed course.',
            'months' => 3,
            'status' => 'pending',
            'submitted_date' => now()->toDateString(),
            'request' => [
                'submittedAt' => now()->toIso8601String(),
                'approvals' => [],
                'assignedReviewers' => [],
                'threshold' => 2,
                'status' => 'pending',
            ],
            'guarantors' => [
                ['name' => 'Abdul Salam', 'phone' => '9876543210', 'rel' => 'Relative'],
                ['name' => 'Basheer V.K', 'phone' => '9123456780', 'rel' => 'Friend'],
            ],
            'repayments' => [
                ['due' => now()->addMonth()->startOfMonth()->toDateString(), 'paid' => null, 'amt' => 5000],
                ['due' => now()->addMonths(2)->startOfMonth()->toDateString(), 'paid' => null, 'amt' => 5000],
                ['due' => now()->addMonths(3)->startOfMonth()->toDateString(), 'paid' => null, 'amt' => 5000],
            ],
            'audit' => [
                [
                    'action' => 'Submitted',
                    'by' => $member->name,
                    'date' => now()->toDateTimeString(),
                    'note' => 'Application generated.',
                    'category' => 'loan',
                ],
            ],
        ]);
    }
}

