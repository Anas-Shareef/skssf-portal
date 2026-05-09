<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Campaign;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CampaignController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => Campaign::query()->latest('id')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'goal' => ['nullable', 'numeric', 'min:0'],
            'received' => ['nullable', 'numeric', 'min:0'],
            'status' => ['nullable', 'string', 'max:100'],
            'note' => ['nullable', 'string'],
        ]);

        $campaign = Campaign::query()->create([
            ...$payload,
            'campaign_no' => 'C-'.strtoupper(substr(md5((string) microtime(true)), 0, 7)),
            'period' => now()->format('F Y'),
            'goal' => $payload['goal'] ?? 0,
            'received' => $payload['received'] ?? 0,
            'status' => $payload['status'] ?? 'Active',
        ]);

        return response()->json(['data' => $campaign], 201);
    }

    public function destroy(Campaign $campaign): JsonResponse
    {
        DB::transaction(function () use ($campaign): void {
            // Recover assets: Find all units in this mission and return them to warehouse
            $units = \App\Models\Unit::query()->where('current_mission_id', $campaign->id)->get();
            foreach ($units as $unit) {
                $product = \App\Models\Product::query()->find($unit->product_id);
                if ($product) {
                    $product->available_quantity += 1;
                    $product->save();
                }

                $unit->status = 'available';
                $unit->current_mission_id = null;
                $unit->current_holder_id = null;
                $unit->save();
            }

            // Delete campaign
            $campaign->delete();
        });

        return response()->json(['success' => true]);
    }
}

