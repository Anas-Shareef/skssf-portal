<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected $fillable = [
        'code',
        'role',
        'member_no',
        'name',
        'email',
        'phone',
        'branch',
        'occupation',
        'designation',
        'avatar',
        'addr',
        'dob',
        'gender',
        'salary',
        'active',
        'join_date',
        'sahachari_paid',
        'sah_miss',
        'total_donated',
        'perms',
        'is_approver',
        'password',
        'api_token',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'api_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'active' => 'boolean',
            'is_approver' => 'boolean',
            'salary' => 'decimal:2',
            'total_donated' => 'decimal:2',
            'sahachari_paid' => 'array',
            'sah_miss' => 'array',
            'perms' => 'array',
            'dob' => 'date',
            'join_date' => 'date',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'code';
    }
}
