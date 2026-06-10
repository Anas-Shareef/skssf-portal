<?php

use Illuminate\Database\Migrations\Migration;
use App\Models\Loan;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Reset LOAN-2026-2771 (Education Fees - 9 Months)
        $loan1 = Loan::where('loan_no', 'LOAN-2026-2771')->first();
        if ($loan1) {
            $repayments = $loan1->repayments;
            if (is_array($repayments)) {
                foreach ($repayments as $idx => &$rep) {
                    if ($idx > 0) {
                        $rep['paid'] = null;
                        $rep['paid_date'] = null;
                        $rep['paid_amount'] = null;
                        $rep['method'] = null;
                        $rep['notes'] = null;
                        $rep['proof'] = null;
                        unset($rep['request']);
                    }
                }
                $loan1->repayments = $repayments;
                $loan1->status = 'approved';
                $loan1->save();
            }
        }

        // 2. Reset LOAN-2026-7131 (Marriage Assistance - 6 Months)
        $loan2 = Loan::where('loan_no', 'LOAN-2026-7131')->first();
        if ($loan2) {
            $repayments = $loan2->repayments;
            if (is_array($repayments)) {
                foreach ($repayments as $idx => &$rep) {
                    if ($idx > 0) {
                        $rep['paid'] = null;
                        $rep['paid_date'] = null;
                        $rep['paid_amount'] = null;
                        $rep['method'] = null;
                        $rep['notes'] = null;
                        $rep['proof'] = null;
                        unset($rep['request']);
                    }
                }
                $loan2->repayments = $repayments;
                $loan2->status = 'approved';
                $loan2->save();
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No rollback needed for data correction migration
    }
};
