<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    protected $fillable = [
        'product_no',
        'name',
        'category',
        'unit',
        'total_quantity',
        'available_quantity',
        'photo',
    ];

    public function units(): HasMany
    {
        return $this->hasMany(Unit::class);
    }

    public function getRouteKeyName(): string
    {
        return 'product_no';
    }
}
