<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Unit extends Model
{
    protected $fillable = [
        'unit_no',
        'product_id',
        'barcode',
        'status',
        'current_holder_id',
        'current_mission_id',
        'checkout_at',
        'checkin_at',
    ];

    protected function casts(): array
    {
        return [
            'checkout_at' => 'datetime',
            'checkin_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function currentHolder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'current_holder_id');
    }

    public function currentMission(): BelongsTo
    {
        return $this->belongsTo(Campaign::class, 'current_mission_id');
    }

    public function getRouteKeyName(): string
    {
        return 'unit_no';
    }
}
