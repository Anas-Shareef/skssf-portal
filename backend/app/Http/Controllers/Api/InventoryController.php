<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Campaign;
use App\Models\InventoryTransaction;
use App\Models\Kit;
use App\Models\Product;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class InventoryController extends Controller
{
    public function products(): JsonResponse
    {
        return response()->json(['data' => Product::query()->latest('id')->get()]);
    }

    public function units(): JsonResponse
    {
        return response()->json(['data' => Unit::query()->with(['product', 'currentHolder', 'currentMission'])->latest('id')->get()]);
    }

    public function kits(): JsonResponse
    {
        return response()->json(['data' => Kit::query()->latest('id')->get()]);
    }

    public function transactions(): JsonResponse
    {
        return response()->json(['data' => InventoryTransaction::query()->latest('id')->get()]);
    }

    public function storeProduct(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'category' => ['required', 'string', 'max:255'],
            'unit' => ['nullable', 'string', 'max:100'],
            'total_quantity' => ['required', 'integer', 'min:1'],
            'photo' => ['nullable', 'string'],
        ]);

        $product = DB::transaction(function () use ($payload): Product {
            $seq = str_pad((string) (Product::query()->count() + 1), 3, '0', STR_PAD_LEFT);
            $sku = 'SKSSF-'.now()->year.'-'.strtoupper(substr($payload['category'], 0, 3)).'-'.$seq;

            $product = Product::query()->create([
                ...$payload,
                'product_no' => 'P-'.strtoupper(substr(md5($sku), 0, 7)),
                'available_quantity' => $payload['total_quantity'],
            ]);

            for ($i = 1; $i <= $payload['total_quantity']; $i++) {
                $code = 'U'.str_pad((string) $i, 2, '0', STR_PAD_LEFT);
                Unit::query()->create([
                    'unit_no' => 'UN-'.strtoupper(substr(md5($sku.'-'.$i), 0, 7)),
                    'product_id' => $product->id,
                    'barcode' => $sku.'-'.$code,
                    'status' => 'available',
                ]);
            }

            return $product;
        });

        return response()->json(['data' => $product], 201);
    }

    public function updateProduct(Request $request, Product $product): JsonResponse
    {
        $payload = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'category' => ['sometimes', 'string', 'max:255'],
            'unit' => ['sometimes', 'nullable', 'string', 'max:100'],
            'total_quantity' => ['sometimes', 'integer', 'min:1'],
            'available_quantity' => ['sometimes', 'integer', 'min:0'],
            'photo' => ['sometimes', 'nullable', 'string'],
        ]);

        $product->fill($payload);
        $product->save();

        return response()->json(['data' => $product]);
    }

    public function createKit(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'unit_ids' => ['required', 'array', 'min:1'],
            'unit_ids.*' => ['required'],
        ]);

        $unitIds = collect($payload['unit_ids'])
            ->map(function ($value) {
                if (is_numeric($value)) {
                    return (int) $value;
                }

                $unit = Unit::query()->where('unit_no', (string) $value)->first();
                return $unit?->id;
            })
            ->filter()
            ->values()
            ->all();

        if (count($unitIds) === 0) {
            return response()->json(['message' => 'No valid units selected'], 422);
        }

        $kit = DB::transaction(function () use ($payload, $unitIds): Kit {
            $num = str_pad((string) (Kit::query()->count() + 1), 3, '0', STR_PAD_LEFT);
            $kit = Kit::query()->create([
                'kit_no' => 'KIT-'.strtoupper(substr(md5($num), 0, 7)),
                'name' => $payload['name'],
                'barcode' => 'SKSSF-KIT-'.$num,
                'child_units' => $unitIds,
            ]);

            // Mark units as kitted and decrease available count for products
            foreach ($unitIds as $uid) {
                $unit = Unit::query()->find($uid);
                if ($unit && $unit->status === 'available') {
                    $unit->status = 'kitted';
                    $unit->save();
                    
                    $product = Product::query()->find($unit->product_id);
                    if ($product) {
                        $product->available_quantity = max(0, $product->available_quantity - 1);
                        $product->save();
                    }
                }
            }
            return $kit;
        });

        return response()->json(['data' => $kit], 201);
    }

    public function scan(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'barcode' => ['required', 'string', 'max:255'],
            'type' => ['required', Rule::in(['checkout', 'checkin'])],
            'adminBy' => ['required', 'string', 'max:255'],
            'assignedTo' => ['nullable', 'string', 'max:255'],
            'memberName' => ['nullable', 'string', 'max:255'],
            'missionId' => ['nullable', 'string', 'max:255'],
        ]);

        $kit = Kit::query()->where('barcode', $payload['barcode'])->first();
        $units = $kit
            ? Unit::query()->whereIn('id', $kit->child_units ?? [])->get()
            : Unit::query()->where('barcode', $payload['barcode'])->get();

        if ($units->isEmpty()) {
            return response()->json(['success' => false, 'error' => 'Barcode not found'], 422);
        }

        DB::transaction(function () use ($units, $payload): void {
            foreach ($units as $unit) {
                $product = Product::query()->find($unit->product_id);
                if (!$product) {
                    continue;
                }

                if ($payload['type'] === 'checkout' && ($unit->status === 'available' || $unit->status === 'kitted')) {
                    $holderId = null;
                    if (!empty($payload['assignedTo'])) {
                        $holder = User::query()->where('code', $payload['assignedTo'])->first();
                        $holderId = $holder?->id;
                    }
                    $missionId = null;
                    if (!empty($payload['missionId'])) {
                        $mission = Campaign::query()
                            ->where('campaign_no', $payload['missionId'])
                            ->orWhere('id', $payload['missionId'])
                            ->first();
                        $missionId = $mission?->id;
                    }

                    $unit->status = 'checked_out';
                    $unit->current_holder_id = $holderId;
                    $unit->current_mission_id = $missionId;
                    $unit->checkout_at = now();
                    $product->available_quantity = max(0, $product->available_quantity - 1);
                }

                if ($payload['type'] === 'checkin' && $unit->status === 'checked_out') {
                    $unit->status = 'available';
                    $unit->current_holder_id = null;
                    $unit->current_mission_id = null;
                    $unit->checkin_at = now();
                    $product->available_quantity = $product->available_quantity + 1;
                }

                $unit->save();
                $product->save();

                InventoryTransaction::query()->create([
                    'tx_no' => 'TX-'.strtoupper(substr(md5($unit->id.'-'.microtime(true)), 0, 7)),
                    'unit_id' => $unit->id,
                    'product_id' => $unit->product_id,
                    'barcode' => $unit->barcode,
                    'type' => $payload['type'],
                    'admin_by' => $payload['adminBy'],
                    'assigned_to' => $payload['assignedTo'] ?? null,
                    'member_name' => $payload['memberName'] ?? null,
                    'mission_id' => $payload['missionId'] ?? null,
                    'note' => $payload['type'] === 'checkout' ? 'Checked out' : 'Checked in',
                    'happened_at' => now(),
                ]);
            }
        });

        return response()->json(['success' => true]);
    }

    public function updateUnitStatus(Request $request, Unit $unit): JsonResponse
    {
        $payload = $request->validate([
            'status' => ['required', Rule::in(['available', 'damaged', 'lost'])],
            'adminBy' => ['required', 'string', 'max:255'],
            'note' => ['nullable', 'string'],
        ]);

        DB::transaction(function () use ($unit, $payload): void {
            $product = Product::query()->find($unit->product_id);
            $previous = $unit->status;

            if ($product) {
                if ($previous === 'available' && $payload['status'] !== 'available') {
                    $product->available_quantity = max(0, $product->available_quantity - 1);
                } elseif ($previous !== 'available' && $payload['status'] === 'available') {
                    $product->available_quantity += 1;
                }
                $product->save();
            }

            $unit->status = $payload['status'];
            $unit->current_holder_id = null;
            $unit->current_mission_id = null;
            $unit->save();

            InventoryTransaction::query()->create([
                'tx_no' => 'TX-'.strtoupper(substr(md5($unit->id.'-'.microtime(true)), 0, 7)),
                'unit_id' => $unit->id,
                'product_id' => $unit->product_id,
                'barcode' => $unit->barcode,
                'type' => 'adjustment',
                'admin_by' => $payload['adminBy'],
                'assigned_to' => null,
                'member_name' => null,
                'mission_id' => null,
                'note' => $payload['note'] ?? ('Manual status update: '.$previous.' -> '.$payload['status']),
                'happened_at' => now(),
            ]);
        });

        return response()->json(['success' => true]);
    }

    public function updateUnit(Request $request, Unit $unit): JsonResponse
    {
        $payload = $request->validate([
            'unit_no' => ['sometimes', 'string', 'max:255', Rule::unique('units')->ignore($unit->id)],
            'barcode' => ['sometimes', 'string', 'max:255', Rule::unique('units')->ignore($unit->id)],
            'status' => ['sometimes', Rule::in(['available', 'damaged', 'lost', 'checked_out'])],
        ]);

        $unit->update($payload);
        return response()->json(['success' => true]);
    }

    public function destroyProduct(Product $product): JsonResponse
    {
        // Safety check: Cannot delete if any unit is checked out
        $checkedOutCount = Unit::query()->where('product_id', $product->id)->where('status', 'checked_out')->count();
        if ($checkedOutCount > 0) {
            return response()->json(['message' => 'Cannot delete product. Some units are still checked out/deployed.'], 422);
        }

        DB::transaction(function () use ($product): void {
            // Delete associated units
            Unit::query()->where('product_id', $product->id)->delete();
            // Delete product
            $product->delete();
        });

        return response()->json(['success' => true]);
    }

    public function destroyKit(Kit $kit): JsonResponse
    {
        DB::transaction(function () use ($kit): void {
            // Restore units to available status
            $unitIds = $kit->child_units ?? [];
            foreach ($unitIds as $uid) {
                $unit = Unit::query()->find($uid);
                if ($unit && $unit->status === 'kitted') {
                    $unit->status = 'available';
                    $unit->save();

                    $product = Product::query()->find($unit->product_id);
                    if ($product) {
                        $product->available_quantity += 1;
                        $product->save();
                    }
                }
            }
            $kit->delete();
        });
        return response()->json(['success' => true]);
    }

    public function updateKit(Request $request, Kit $kit): JsonResponse
    {
        $payload = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'unit_ids' => ['sometimes', 'array', 'min:1'],
            'unit_ids.*' => ['required'],
        ]);

        $newUnitIds = [];
        if (isset($payload['unit_ids'])) {
            $newUnitIds = collect($payload['unit_ids'])
                ->map(function ($value) {
                    if (is_numeric($value)) {
                        return (int) $value;
                    }
                    $unit = Unit::query()->where('unit_no', (string) $value)->first();
                    return $unit?->id;
                })
                ->filter()
                ->values()
                ->all();
        }

        DB::transaction(function () use ($kit, $payload, $newUnitIds): void {
            if (isset($payload['name'])) {
                $kit->name = $payload['name'];
            }

            if (isset($payload['unit_ids'])) {
                $oldUnitIds = $kit->child_units ?? [];
                
                $toRemove = array_diff($oldUnitIds, $newUnitIds);
                $toAdd = array_diff($newUnitIds, $oldUnitIds);

                // Restore removed units
                foreach ($toRemove as $uid) {
                    $unit = Unit::query()->find($uid);
                    if ($unit && $unit->status === 'kitted') {
                        $unit->status = 'available';
                        $unit->save();

                        $product = Product::query()->find($unit->product_id);
                        if ($product) {
                            $product->available_quantity += 1;
                            $product->save();
                        }
                    }
                }

                // Reserve added units
                foreach ($toAdd as $uid) {
                    $unit = Unit::query()->find($uid);
                    if ($unit && $unit->status === 'available') {
                        $unit->status = 'kitted';
                        $unit->save();

                        $product = Product::query()->find($unit->product_id);
                        if ($product) {
                            $product->available_quantity = max(0, $product->available_quantity - 1);
                            $product->save();
                        }
                    }
                }

                $kit->child_units = $newUnitIds;
            }

            $kit->save();
        });

        return response()->json(['data' => $kit]);
    }
}
