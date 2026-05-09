<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Loan extends Model
{
    protected $fillable = [
        'loan_no',
        'user_id',
        'member_no',
        'name',
        'branch',
        'mob',
        'amount',
        'purpose',
        'purpose_desc',
        'months',
        'status',
        'submitted_date',
        'approved_date',
        'disbursed_date',
        'admin_note',
        'super_note',
        'approved_by',
        'guarantors',
        'repayments',
        'request',
        'audit',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'guarantors' => 'array',
            'repayments' => 'array',
            'request' => 'array',
            'audit' => 'array',
            'submitted_date' => 'date',
            'approved_date' => 'date',
            'disbursed_date' => 'date',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function getRouteKeyName(): string
    {
        return 'loan_no';
    }
}
