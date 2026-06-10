<?php

define('LARAVEL_START', microtime(true));

require __DIR__.'/../vendor/autoload.php';
$app = require_once __DIR__.'/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$kernel->bootstrap();

// Simple security check
if (($_GET['key'] ?? '') !== 'antigravity_db_reset_9988') {
    header('HTTP/1.1 403 Forbidden');
    die('Forbidden: Invalid key');
}

use App\Models\Loan;
use Illuminate\Support\Facades\DB;

echo "<pre>";
echo "SQLite DB Path: " . config('database.connections.sqlite.database') . "\n";
echo "DB File Exists: " . (file_exists(config('database.connections.sqlite.database')) ? 'YES' : 'NO') . "\n";
if (file_exists(config('database.connections.sqlite.database'))) {
    echo "DB Size: " . filesize(config('database.connections.sqlite.database')) . " bytes\n";
}

echo "\n--- Migration Status ---\n";
try {
    $migrations = DB::table('migrations')->get();
    foreach ($migrations as $m) {
        echo "Migration: {$m->migration} (batch: {$m->batch})\n";
    }
} catch (\Exception $e) {
    echo "Error fetching migrations: " . $e->getMessage() . "\n";
}

echo "\n--- All Loans ---\n";
try {
    $loans = Loan::all();
    foreach ($loans as $loan) {
        $repayments = $loan->repayments;
        $totalEmis = is_array($repayments) ? count($repayments) : 0;
        $paidEmis = 0;
        if (is_array($repayments)) {
            foreach ($repayments as $r) {
                if (!empty($r['paid'])) {
                    $paidEmis++;
                }
            }
        }
        echo "Loan: {$loan->loan_no} | Purpose: {$loan->purpose} | Total EMIs: {$totalEmis} | Paid EMIs: {$paidEmis} | Status: {$loan->status}\n";
    }
} catch (\Exception $e) {
    echo "Error fetching loans: " . $e->getMessage() . "\n";
}

if (isset($_GET['execute']) && $_GET['execute'] === '1') {
    echo "\n--- Executing Direct Reset ---\n";

    // 1. Reset LOAN-2026-2771
    $loan1 = Loan::where('loan_no', 'LOAN-2026-2771')->first();
    if ($loan1) {
        echo "Found LOAN-2026-2771. Resetting...\n";
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
            echo "Successfully reset LOAN-2026-2771. Current paid count: " . count(array_filter($repayments, fn($r) => !empty($r['paid']))) . "\n";
        }
    } else {
        echo "LOAN-2026-2771 not found.\n";
    }

    // 2. Reset LOAN-2026-7131
    $loan2 = Loan::where('loan_no', 'LOAN-2026-7131')->first();
    if ($loan2) {
        echo "Found LOAN-2026-7131. Resetting...\n";
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
            echo "Successfully reset LOAN-2026-7131. Current paid count: " . count(array_filter($repayments, fn($r) => !empty($r['paid']))) . "\n";
        }
    } else {
        echo "LOAN-2026-7131 not found.\n";
    }
}

echo "</pre>";
