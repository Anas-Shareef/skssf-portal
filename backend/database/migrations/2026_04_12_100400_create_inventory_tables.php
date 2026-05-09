<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->string('product_no')->unique();
            $table->string('name');
            $table->string('category');
            $table->string('unit')->nullable();
            $table->unsignedInteger('total_quantity')->default(0);
            $table->unsignedInteger('available_quantity')->default(0);
            $table->timestamps();
        });

        Schema::create('units', function (Blueprint $table): void {
            $table->id();
            $table->string('unit_no')->unique();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('barcode')->unique();
            $table->string('status')->default('available');
            $table->foreignId('current_holder_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('current_mission_id')->nullable()->constrained('campaigns')->nullOnDelete();
            $table->timestamp('checkout_at')->nullable();
            $table->timestamp('checkin_at')->nullable();
            $table->timestamps();
        });

        Schema::create('kits', function (Blueprint $table): void {
            $table->id();
            $table->string('kit_no')->unique();
            $table->string('name');
            $table->string('barcode')->unique();
            $table->json('child_units');
            $table->timestamps();
        });

        Schema::create('inventory_transactions', function (Blueprint $table): void {
            $table->id();
            $table->string('tx_no')->unique();
            $table->foreignId('unit_id')->nullable()->constrained('units')->nullOnDelete();
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->string('barcode');
            $table->string('type');
            $table->string('admin_by');
            $table->string('assigned_to')->nullable();
            $table->string('member_name')->nullable();
            $table->string('mission_id')->nullable();
            $table->text('note')->nullable();
            $table->timestamp('happened_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_transactions');
        Schema::dropIfExists('kits');
        Schema::dropIfExists('units');
        Schema::dropIfExists('products');
    }
};

