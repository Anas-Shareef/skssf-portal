<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loans', function (Blueprint $table): void {
            $table->id();
            $table->string('loan_no')->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('member_no')->nullable();
            $table->string('name');
            $table->string('branch')->nullable();
            $table->string('mob')->nullable();
            $table->decimal('amount', 12, 2);
            $table->string('purpose');
            $table->text('purpose_desc')->nullable();
            $table->unsignedSmallInteger('months')->default(1);
            $table->string('status')->default('pending');
            $table->date('submitted_date')->nullable();
            $table->date('approved_date')->nullable();
            $table->date('disbursed_date')->nullable();
            $table->text('admin_note')->nullable();
            $table->text('super_note')->nullable();
            $table->string('approved_by')->nullable();
            $table->json('guarantors')->nullable();
            $table->json('repayments')->nullable();
            $table->json('request')->nullable();
            $table->json('audit')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loans');
    }
};

