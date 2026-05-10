<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Campaign;
use App\Models\Donation;
use App\Models\InventoryTransaction;
use App\Models\Kit;
use App\Models\Loan;
use App\Models\PortalConfig;
use App\Models\Product;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PortalConfigController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json(['data' => $this->config()]);
    }

    public function update(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'org_name' => ['sometimes', 'string', 'max:255'],
            'org_logo' => ['sometimes', 'nullable', 'string'],
            'org_scale' => ['sometimes', 'numeric', 'min:0.1'],
            'max_loan' => ['sometimes', 'numeric', 'min:0'],
            'sah_amt' => ['sometimes', 'numeric', 'min:0'],
            'repayment_approvals_needed' => ['sometimes', 'integer', 'min:1'],
            'loan_approvals_needed' => ['sometimes', 'integer', 'min:1'],
            'approver_roles' => ['sometimes', 'array'],
            'authorized_reviewers' => ['sometimes', 'array'],
            'default_committee' => ['sometimes', 'array'],
        ]);

        $config = $this->config();
        $config->fill($payload);
        $config->save();

        return response()->json(['data' => $config]);
    }

    public function bootstrap(Request $request): JsonResponse
    {
        $user = $request->user();
        
        $loanQuery = Loan::query()->latest('id');
        $userQuery = User::query()->orderBy('id');
        $donationQuery = Donation::query()->latest('id');

        if ($user->role === 'member') {
            $loanQuery->where('user_id', $user->id);
            $userQuery->where('id', $user->id); // Members only see themselves
            $donationQuery->where('user_id', $user->id);
        } elseif ($user->role === 'admin') {
            $loanQuery->where('branch', $user->branch);
            $userQuery->where('branch', $user->branch);
            // Admins see branch donations? For now yes.
        }

        return response()->json([
            'portal_config' => $this->config(),
            'users' => $userQuery->get(),
            'loans' => $loanQuery->get(),
            'campaigns' => Campaign::query()->latest('id')->get(),
            'donations' => $donationQuery->get(),
            'products' => Product::query()->latest('id')->get(),
            'units' => Unit::query()->latest('id')->get(),
            'kits' => Kit::query()->latest('id')->get(),
            'inventory_transactions' => InventoryTransaction::query()->latest('id')->get(),
        ]);
    }

    public function resetData(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || $user->role !== 'super') {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        DB::transaction(function (): void {
            InventoryTransaction::query()->delete();
            Kit::query()->delete();
            Unit::query()->delete();
            Product::query()->delete();
            Donation::query()->delete();
            Campaign::query()->delete();
            Loan::query()->delete();
            User::query()->where('role', '!=', 'super')->delete();

            PortalConfig::query()->delete();
            $this->config();
        });

        return response()->json(['message' => 'Portal data reset']);
    }

    private function config(): PortalConfig
    {
        return PortalConfig::query()->firstOrCreate([], [
            'org_name' => 'SKSSF Poyanad Branch',
            'org_logo' => '',
            'org_scale' => 1.0,
            'max_loan' => 50000,
            'sah_amt' => 100,
            'repayment_approvals_needed' => 1,
            'loan_approvals_needed' => 2,
            'approver_roles' => ['President', 'Secretary', 'Treasurer'],
            'authorized_reviewers' => [],
            'default_committee' => [],
        ]);
    }
}
