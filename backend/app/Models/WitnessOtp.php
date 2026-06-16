<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WitnessOtp extends Model
{
    protected $fillable = [
        'phone',
        'code',
        'expires_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
    ];
}
