<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaigns', function (Blueprint $table): void {
            $table->id();
            $table->string('campaign_no')->unique();
            $table->string('title');
            $table->decimal('goal', 12, 2)->default(0);
            $table->decimal('received', 12, 2)->default(0);
            $table->string('status')->default('Active');
            $table->text('note')->nullable();
            $table->string('period')->nullable();
            $table->timestamps();
        });

        Schema::create('donations', function (Blueprint $table): void {
            $table->id();
            $table->string('donation_no')->unique();
            $table->foreignId('campaign_id')->nullable()->constrained()->nullOnDelete();
            $table->string('donor_name');
            $table->string('donor_phone')->nullable();
            $table->decimal('amount', 12, 2);
            $table->string('method')->default('cash');
            $table->text('note')->nullable();
            $table->date('donated_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('donations');
        Schema::dropIfExists('campaigns');
    }
};

