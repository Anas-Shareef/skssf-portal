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

echo json_encode([
    'LOAN-2026-2771' => $loan1 ? [
        'status' => $loan1->status,
        'repayments' => $loan1->repayments
    ] : null,
    'LOAN-2026-7131' => $loan2 ? [
        'status' => $loan2->status,
        'repayments' => $loan2->repayments
    ] : null,
], JSON_PRETTY_PRINT);
