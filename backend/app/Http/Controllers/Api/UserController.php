<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $role = $request->query('role');
        $query = User::query()->orderBy('id');

        if ($role) {
            $query->where('role', $role);
        }

        return response()->json(['data' => $query->get()]);
    }

    public function show(User $user): JsonResponse
    {
        return response()->json(['data' => $user]);
    }

    public function store(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['nullable', 'string', 'min:6'],
            'role' => ['required', Rule::in(['super', 'admin', 'member'])],
            'member_no' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:40'],
            'branch' => ['nullable', 'string', 'max:255'],
            'occupation' => ['nullable', 'string', 'max:255'],
            'designation' => ['nullable', 'string', 'max:255'],
            'avatar' => ['nullable', 'string'],
            'addr' => ['nullable', 'string'],
            'gender' => ['nullable', 'string', 'max:50'],
            'salary' => ['nullable', 'numeric', 'min:0'],
            'join_date' => ['nullable', 'date'],
            'is_approver' => ['nullable', 'boolean'],
            'perms' => ['nullable', 'array'],
        ]);

        $prefix = $payload['role'] === 'super' ? 'S' : ($payload['role'] === 'admin' ? 'A' : 'M');

        $user = User::query()->create([
            ...$payload,
            'code' => $prefix.str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT),
            'password' => Hash::make((string) ($payload['password'] ?? 'password123')),
            'active' => true,
            'sahachari_paid' => [],
            'sah_miss' => [],
            'total_donated' => 0,
            'join_date' => $payload['join_date'] ?? now()->toDateString(),
            'api_token' => null,
        ]);

        return response()->json(['data' => $user], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $payload = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['sometimes', 'nullable', 'string', 'min:6'],
            'role' => ['sometimes', Rule::in(['super', 'admin', 'member'])],
            'member_no' => ['sometimes', 'nullable', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'branch' => ['sometimes', 'nullable', 'string', 'max:255'],
            'occupation' => ['sometimes', 'nullable', 'string', 'max:255'],
            'designation' => ['sometimes', 'nullable', 'string', 'max:255'],
            'avatar' => ['sometimes', 'nullable', 'string'],
            'addr' => ['sometimes', 'nullable', 'string'],
            'gender' => ['sometimes', 'nullable', 'string', 'max:50'],
            'salary' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'active' => ['sometimes', 'boolean'],
            'join_date' => ['sometimes', 'nullable', 'date'],
            'is_approver' => ['sometimes', 'boolean'],
            'perms' => ['sometimes', 'nullable', 'array'],
            'sahachari_paid' => ['sometimes', 'array'],
            'sah_miss' => ['sometimes', 'array'],
            'total_donated' => ['sometimes', 'numeric', 'min:0'],
        ]);

        if (array_key_exists('password', $payload) && $payload['password']) {
            $payload['password'] = Hash::make((string) $payload['password']);
        } else {
            unset($payload['password']);
        }

        $user->fill($payload);
        $user->save();

        return response()->json(['data' => $user]);
    }

    public function destroy(User $user): JsonResponse
    {
        $user->delete();
        return response()->json(['message' => 'User deleted']);
    }
}
