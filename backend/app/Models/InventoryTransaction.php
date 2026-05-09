<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InventoryTransaction extends Model
{
    protected $fillable = [
        'tx_no',
        'unit_id',
        'product_id',
        'barcode',
        'type',
        'admin_by',
        'assigned_to',
        'member_name',
        'mission_id',
        'note',
        'happened_at',
    ];

    protected function casts(): array
    {
        return [
            'happened_at' => 'datetime',
        ];
    }
}

