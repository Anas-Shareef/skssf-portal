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

function getRequestInfo($loan) {
    if (!$loan || !is_array($loan->repayments) || count($loan->repayments) === 0) {
        return null;
    }
    $firstRep = $loan->repayments[0];
    return [
        'paid' => $firstRep['paid'] ?? null,
        'paid_date' => $firstRep['paid_date'] ?? null,
        'request_status' => $firstRep['request']['status'] ?? null,
        'request_isFullClearance' => $firstRep['request']['isFullClearance'] ?? null,
        'approvals' => $firstRep['request']['approvals'] ?? null,
        'assignedReviewers' => $firstRep['request']['assignedReviewers'] ?? null,
    ];
}

echo json_encode([
    'LOAN-2026-2771' => getRequestInfo($loan1),
    'LOAN-2026-7131' => getRequestInfo($loan2),
], JSON_PRETTY_PRINT);
