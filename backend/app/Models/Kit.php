<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Kit extends Model
{
    protected $fillable = [
        'kit_no',
        'name',
        'barcode',
        'child_units',
    ];

    protected function casts(): array
    {
        return [
            'child_units' => 'array',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'kit_no';
    }
}

