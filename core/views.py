import json

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.http import require_http_methods, require_POST
from django.views.decorators.csrf import ensure_csrf_cookie

from .models import Match, MatchPlayer, PlayerProfile, profile_slug


PROFILE_COLORS = ["#53d66a", "#e84f3f", "#f4b44e", "#4fb3ff", "#ec4899", "#a855f7"]


@ensure_csrf_cookie
def index(request):
    return render(request, "index.html")


def body_json(request):
    try:
        return json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return {}


def stats_to_json(profile):
    return {
        "gamesPlayed": profile.games_played,
        "wins": profile.wins,
        "losses": profile.losses,
        "total01Darts": profile.total01_darts,
        "total01Points": profile.total01_points,
        "best01Avg": profile.best01_avg,
        "best01DartsToWin": profile.best01_darts_to_win,
        "busts": profile.busts,
        "ton100": profile.ton100,
        "ton140": profile.ton140,
        "ton180": profile.ton180,
        "totalCricketTurns": profile.total_cricket_turns,
        "totalCricketMarks": profile.total_cricket_marks,
        "bestCricketMPR": profile.best_cricket_mpr,
        "highestCricketScore": profile.highest_cricket_score,
    }


def profile_to_json(profile):
    return {
        "id": f"p_{profile.id}",
        "serverId": profile.id,
        "name": profile.name,
        "color": profile.color,
        "ownerUserId": profile.user_id,
        "createdAt": profile.created_at.isoformat(),
        "stats": stats_to_json(profile),
    }


def match_to_json(match):
    rows = []
    for row in match.players.select_related("profile").all():
        rows.append({
            "id": f"p_{row.profile_id}",
            "serverId": row.profile_id,
            "name": row.profile.name,
            "isWinner": row.is_winner,
            "score": row.score,
            "totalDarts": row.total_darts,
            "totalTurns": row.total_turns,
            "avgScore": row.avg_score,
            "bestTurn": row.best_turn,
            "bustCount": row.bust_count,
        })
    return {
        "id": f"m_{match.id}",
        "serverId": match.id,
        "date": match.played_at.isoformat(),
        "gameMode": match.game_mode,
        "gameOptions": match.game_options,
        "players": rows,
    }


def get_or_create_profile(name, color=None, user=None):
    clean_name = (name or "").strip()
    if not clean_name:
        clean_name = "Player"
    slug = profile_slug(clean_name)
    profile = PlayerProfile.objects.filter(name_slug=slug).first()
    if profile:
        if user and profile.user_id is None:
            profile.user = user
            profile.save(update_fields=["user"])
        return profile

    existing_user = User.objects.filter(username__iexact=clean_name).first()
    return PlayerProfile.objects.create(
        user=user or existing_user,
        name=clean_name,
        name_slug=slug,
        color=color or PROFILE_COLORS[PlayerProfile.objects.count() % len(PROFILE_COLORS)],
    )


def profile_scope_for_user(user):
    own_profile = get_or_create_profile(user.username, user=user)
    match_ids = MatchPlayer.objects.filter(profile=own_profile).values_list("match_id", flat=True)
    profile_ids = MatchPlayer.objects.filter(match_id__in=match_ids).values_list("profile_id", flat=True)
    return PlayerProfile.objects.filter(id__in=set(profile_ids) | {own_profile.id}).order_by("name")


def session_payload(user):
    profiles = list(profile_scope_for_user(user))
    matches = Match.objects.filter(players__profile__in=profiles).distinct().prefetch_related("players__profile").order_by("-played_at")[:100]
    return {
        "authenticated": True,
        "user": {"id": user.id, "name": user.username},
        "profiles": [profile_to_json(profile) for profile in profiles],
        "matches": [match_to_json(match) for match in matches],
    }


@require_http_methods(["GET"])
def session_view(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False})
    return JsonResponse(session_payload(request.user))


@require_POST
def register_view(request):
    data = body_json(request)
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username:
        return JsonResponse({"ok": False, "error": "Enter a player name."}, status=400)
    if len(password) < 8:
        return JsonResponse({"ok": False, "error": "Use a password with at least 8 characters."}, status=400)
    if User.objects.filter(username__iexact=username).exists():
        return JsonResponse({"ok": False, "error": "That account already exists. Log in instead."}, status=400)

    user = User.objects.create_user(username=username, password=password)
    get_or_create_profile(username, user=user)
    login(request, user)
    return JsonResponse(session_payload(user))


@require_POST
def login_view(request):
    data = body_json(request)
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    matched_user = User.objects.filter(username__iexact=username).first()
    if matched_user:
        username = matched_user.username
    user = authenticate(request, username=username, password=password)
    if user is None:
        return JsonResponse({"ok": False, "error": "No matching account found for that name and password."}, status=400)
    login(request, user)
    return JsonResponse(session_payload(user))


@require_POST
def logout_view(request):
    logout(request)
    return JsonResponse({"ok": True})


@login_required
@require_POST
def profile_create_view(request):
    data = body_json(request)
    profile = get_or_create_profile(data.get("name"), data.get("color"), request.user if data.get("owned") else None)
    return JsonResponse({"ok": True, "profile": profile_to_json(profile)})


@login_required
@require_http_methods(["DELETE"])
def profile_delete_view(request, profile_id):
    profile = PlayerProfile.objects.filter(id=profile_id, user=request.user).first()
    if not profile:
        return JsonResponse({"ok": False, "error": "Profile not found."}, status=404)
    profile.delete()
    return JsonResponse({"ok": True})


def apply_stats(profile, stats):
    profile.games_played = int(stats.get("gamesPlayed") or 0)
    profile.wins = int(stats.get("wins") or 0)
    profile.losses = int(stats.get("losses") or 0)
    profile.total01_darts = int(stats.get("total01Darts") or 0)
    profile.total01_points = int(stats.get("total01Points") or 0)
    profile.best01_avg = float(stats.get("best01Avg") or 0)
    profile.best01_darts_to_win = stats.get("best01DartsToWin") or None
    profile.busts = int(stats.get("busts") or 0)
    profile.ton100 = int(stats.get("ton100") or 0)
    profile.ton140 = int(stats.get("ton140") or 0)
    profile.ton180 = int(stats.get("ton180") or 0)
    profile.total_cricket_turns = int(stats.get("totalCricketTurns") or 0)
    profile.total_cricket_marks = int(stats.get("totalCricketMarks") or 0)
    profile.best_cricket_mpr = float(stats.get("bestCricketMPR") or 0)
    profile.highest_cricket_score = int(stats.get("highestCricketScore") or 0)
    profile.save()


@login_required
@require_POST
@transaction.atomic
def match_create_view(request):
    data = body_json(request)
    match_data = data.get("match") or {}
    profiles_data = data.get("profiles") or []
    played_at = parse_datetime(match_data.get("date") or "")
    if played_at is None:
        played_at = timezone.now()
    if timezone.is_naive(played_at):
        played_at = timezone.make_aware(played_at)

    profile_by_client_id = {}
    for profile_data in profiles_data:
        profile = get_or_create_profile(profile_data.get("name"), profile_data.get("color"))
        apply_stats(profile, profile_data.get("stats") or {})
        profile_by_client_id[profile_data.get("id")] = profile

    match = Match.objects.create(
        game_mode=match_data.get("gameMode") or "unknown",
        game_options=match_data.get("gameOptions") or {},
        played_at=played_at,
        created_by=request.user,
    )

    for row in match_data.get("players") or []:
        profile = profile_by_client_id.get(row.get("id")) or get_or_create_profile(row.get("name"))
        MatchPlayer.objects.create(
            match=match,
            profile=profile,
            is_winner=bool(row.get("isWinner")),
            score=int(row.get("score") or 0),
            total_darts=int(row.get("totalDarts") or 0),
            total_turns=int(row.get("totalTurns") or 0),
            avg_score=float(row.get("avgScore") or 0),
            best_turn=float(row.get("bestTurn") or 0),
            bust_count=int(row.get("bustCount") or 0),
        )

    return JsonResponse({"ok": True, **session_payload(request.user)})
