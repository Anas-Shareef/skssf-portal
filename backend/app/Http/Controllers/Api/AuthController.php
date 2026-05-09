<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:6'],
            'phone' => ['nullable', 'string', 'max:40'],
            'unit' => ['nullable', 'string', 'max:255'],
            'member_no' => ['nullable', 'string', 'max:255'],
            'role' => ['nullable', Rule::in(['member'])],
        ]);

        $code = 'M'.str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT);
        while (User::query()->where('code', $code)->exists()) {
            $code = 'M'.str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT);
        }

        $user = User::query()->create([
            'code' => $code,
            'role' => 'member',
            'member_no' => $payload['member_no'] ?? null,
            'name' => $payload['name'],
            'email' => $payload['email'],
            'phone' => $payload['phone'] ?? null,
            'branch' => $payload['unit'] ?? null,
            'active' => true,
            'join_date' => now()->toDateString(),
            'sahachari_paid' => [],
            'sah_miss' => [],
            'total_donated' => 0,
            'password' => Hash::make($payload['password']),
            'api_token' => null,
        ]);

        return response()->json(['user' => $user], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::query()->where('email', $payload['email'])->first();
        if (!$user) {
            return response()->json(['message' => 'Invalid credentials'], 422);
        }

        $pass = (string) $payload['password'];
        $valid = Hash::check($pass, (string) $user->password) || hash_equals((string) $user->password, $pass);
        if (!$valid) {
            return response()->json(['message' => 'Invalid credentials'], 422);
        }

        if (hash_equals((string) $user->password, $pass)) {
            $user->password = Hash::make($pass);
        }

        $user->api_token = Str::random(64);
        $user->save();

        return response()->json([
            'token' => $user->api_token,
            'user' => $user,
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $request->user(),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $user->api_token = null;
        $user->save();

        return response()->json(['message' => 'Logged out']);
    }
}
