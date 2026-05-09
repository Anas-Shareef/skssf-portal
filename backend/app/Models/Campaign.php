<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Campaign extends Model
{
    protected $fillable = [
        'campaign_no',
        'title',
        'goal',
        'received',
        'status',
        'note',
        'period',
    ];

    protected function casts(): array
    {
        return [
            'goal' => 'decimal:2',
            'received' => 'decimal:2',
        ];
    }

    public function donations(): HasMany
    {
        return $this->hasMany(Donation::class);
    }

    public function getRouteKeyName(): string
    {
        return 'campaign_no';
    }
}

