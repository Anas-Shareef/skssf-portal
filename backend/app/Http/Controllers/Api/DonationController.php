<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Campaign;
use App\Models\Donation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DonationController extends Controller
{
    public function index(): JsonResponse
    {
        $donations = Donation::query()->with('campaign')->latest('id')->get();
        return response()->json(['data' => $donations]);
    }

    public function store(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'campaign_id' => ['nullable', 'integer', 'exists:campaigns,id'],
            'donor_name' => ['required', 'string', 'max:255'],
            'donor_phone' => ['nullable', 'string', 'max:50'],
            'amount' => ['required', 'numeric', 'min:1'],
            'method' => ['nullable', 'string', 'max:50'],
            'note' => ['nullable', 'string'],
            'donated_at' => ['nullable', 'date'],
        ]);

        $donation = Donation::query()->create([
            ...$payload,
            'donation_no' => 'D-'.strtoupper(substr(md5((string) microtime(true)), 0, 7)),
            'method' => $payload['method'] ?? 'cash',
            'donated_at' => $payload['donated_at'] ?? now()->toDateString(),
        ]);

        if (!empty($payload['campaign_id'])) {
            $campaign = Campaign::query()->find($payload['campaign_id']);
            if ($campaign) {
                $campaign->received = (float) $campaign->received + (float) $payload['amount'];
                $campaign->save();
            }
        }

        return response()->json(['data' => $donation], 201);
    }
}

