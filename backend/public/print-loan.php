<?php

define('LARAVEL_START', microtime(true));

require __DIR__.'/../vendor/autoload.php';
$app = require_once __DIR__.'/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$kernel->bootstrap();

if (($_GET['key'] ?? '') !== 'antigravity_inspect_8877') {
    header('HTTP/1.1 403 Forbidden');
    die('Forbidden');
}

use App\Models\Loan;

header('Content-Type: application/json');

$loan1 = Loan::where('loan_no', 'LOAN-2026-2771')->first();
$loan2 = Loan::where('loan_no', 'LOAN-2026-7131')->first();

function cleanRepayments($loan) {
    if (!$loan) return null;
    $repayments = $loan->repayments;
    if (is_array($repayments)) {
        foreach ($repayments as &$rep) {
            if (isset($rep['proof'])) {
                $rep['proof'] = strlen($rep['proof']) > 100 ? substr($rep['proof'], 0, 50) . '... [TRUNCATED]' : $rep['proof'];
            }
            if (isset($rep['request'])) {
                if (isset($rep['request']['proof'])) {
                    $rep['request']['proof'] = strlen($rep['request']['proof']) > 100 ? substr($rep['request']['proof'], 0, 50) . '... [TRUNCATED]' : $rep['request']['proof'];
                }
            }
        }
    }
    return [
        'status' => $loan->status,
        'repayments' => $repayments
    ];
}

echo json_encode([
    'LOAN-2026-2771' => cleanRepayments($loan1),
    'LOAN-2026-7131' => cleanRepayments($loan2),
], JSON_PRETTY_PRINT);
