<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('code')->nullable()->unique()->after('id');
            $table->string('role')->default('member')->after('code');
            $table->string('member_no')->nullable()->after('role');
            $table->string('phone')->nullable()->after('email');
            $table->string('branch')->nullable()->after('phone');
            $table->string('occupation')->nullable()->after('branch');
            $table->string('designation')->nullable()->after('occupation');
            $table->string('avatar')->nullable()->after('designation');
            $table->text('addr')->nullable()->after('avatar');
            $table->date('dob')->nullable()->after('addr');
            $table->string('gender')->nullable()->after('dob');
            $table->decimal('salary', 12, 2)->default(0)->after('gender');
            $table->boolean('active')->default(true)->after('salary');
            $table->date('join_date')->nullable()->after('active');
            $table->json('sahachari_paid')->nullable()->after('join_date');
            $table->json('sah_miss')->nullable()->after('sahachari_paid');
            $table->decimal('total_donated', 12, 2)->default(0)->after('sah_miss');
            $table->json('perms')->nullable()->after('total_donated');
            $table->boolean('is_approver')->default(false)->after('perms');
            $table->string('api_token', 80)->nullable()->unique()->after('remember_token');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn([
                'code',
                'role',
                'member_no',
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
                'api_token',
            ]);
        });
    }
};

