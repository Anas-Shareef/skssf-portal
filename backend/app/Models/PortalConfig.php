<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PortalConfig extends Model
{
    protected $fillable = [
        'org_name',
        'org_logo',
        'org_scale',
        'max_loan',
        'sah_amt',
        'repayment_approvals_needed',
        'loan_approvals_needed',
        'approver_roles',
        'authorized_reviewers',
        'default_committee',
    ];

    protected function casts(): array
    {
        return [
            'org_scale' => 'decimal:2',
            'max_loan' => 'decimal:2',
            'sah_amt' => 'decimal:2',
            'approver_roles' => 'array',
            'authorized_reviewers' => 'array',
            'default_committee' => 'array',
        ];
    }
}

