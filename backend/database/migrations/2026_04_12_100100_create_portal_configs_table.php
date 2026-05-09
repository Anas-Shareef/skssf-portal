<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('portal_configs', function (Blueprint $table): void {
            $table->id();
            $table->string('org_name')->default('SKSSF Poyanad Branch');
            $table->string('org_logo')->nullable();
            $table->decimal('org_scale', 6, 2)->default(1.0);
            $table->decimal('max_loan', 12, 2)->default(50000);
            $table->decimal('sah_amt', 12, 2)->default(100);
            $table->unsignedSmallInteger('repayment_approvals_needed')->default(1);
            $table->unsignedSmallInteger('loan_approvals_needed')->default(2);
            $table->json('approver_roles')->nullable();
            $table->json('authorized_reviewers')->nullable();
            $table->json('default_committee')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('portal_configs');
    }
};

