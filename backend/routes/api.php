<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CampaignController;
use App\Http\Controllers\Api\DonationController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\LoanController;
use App\Http\Controllers\Api\PortalConfigController;
use App\Http\Controllers\Api\UserController;

Route::get('/test-deploy', function () {
    return response()->json(['commit' => 'ecd8944_diagnostic_v2']);
});

Route::prefix('auth')->group(function (): void {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/register', [AuthController::class, 'register']);
    Route::middleware('api.token')->group(function (): void {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
    });
});

Route::middleware('api.token')->group(function (): void {
    Route::get('/bootstrap', [PortalConfigController::class, 'bootstrap']);
    Route::post('/admin/reset', [PortalConfigController::class, 'resetData']);

    Route::get('/users', [UserController::class, 'index']);
    Route::post('/users', [UserController::class, 'store']);
    Route::get('/users/{user}', [UserController::class, 'show']);
    Route::patch('/users/{user}', [UserController::class, 'update']);
    Route::delete('/users/{user}', [UserController::class, 'destroy']);

    Route::get('/loans', [LoanController::class, 'index']);
    Route::post('/loans', [LoanController::class, 'store']);
    Route::post('/loans/otp/send', [LoanController::class, 'sendOtp']);
    Route::post('/loans/otp/verify', [LoanController::class, 'verifyOtp']);
    Route::patch('/loans/{loan}', [LoanController::class, 'update']);
    Route::post('/loans/{loan}/verify', [LoanController::class, 'verify']);
    Route::delete('/loans', [LoanController::class, 'bulkDelete']);
    Route::post('/loans/{loan}/repayments/{month}/submit', [LoanController::class, 'submitRepayment']);
    Route::post('/loans/{loan}/repayments/{month}/verify', [LoanController::class, 'verifyRepayment']);
    Route::post('/loans/{loan}/repayments/{month}/log', [LoanController::class, 'logRepayment']);

    Route::get('/campaigns', [CampaignController::class, 'index']);
    Route::post('/campaigns', [CampaignController::class, 'store']);
    Route::delete('/campaigns/{campaign}', [CampaignController::class, 'destroy']);

    Route::get('/donations', [DonationController::class, 'index']);
    Route::post('/donations', [DonationController::class, 'store']);

    Route::get('/portal-config', [PortalConfigController::class, 'show']);
    Route::patch('/portal-config', [PortalConfigController::class, 'update']);

    Route::prefix('inventory')->group(function (): void {
        Route::get('/products', [InventoryController::class, 'products']);
        Route::post('/products', [InventoryController::class, 'storeProduct']);
        Route::patch('/products/{product}', [InventoryController::class, 'updateProduct']);
        Route::delete('/products/{product}', [InventoryController::class, 'destroyProduct']);
        Route::get('/units', [InventoryController::class, 'units']);
        Route::get('/kits', [InventoryController::class, 'kits']);
        Route::post('/kits', [InventoryController::class, 'createKit']);
        Route::patch('/kits/{kit}', [InventoryController::class, 'updateKit']);
        Route::delete('/kits/{kit}', [InventoryController::class, 'destroyKit']);
        Route::get('/transactions', [InventoryController::class, 'transactions']);
        Route::post('/scan', [InventoryController::class, 'scan']);
        Route::post('/units/{unit}/status', [InventoryController::class, 'updateUnitStatus']);
        Route::patch('/units/{unit}', [InventoryController::class, 'updateUnit']);
    });
});
