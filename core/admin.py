from django.contrib import admin

from .models import Match, MatchPlayer, PlayerProfile


class MatchPlayerInline(admin.TabularInline):
    model = MatchPlayer
    extra = 0
    autocomplete_fields = ["profile"]


@admin.register(PlayerProfile)
class PlayerProfileAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "games_played", "wins", "losses", "best01_avg", "best_cricket_mpr")
    search_fields = ("name", "user__username")
    readonly_fields = ("created_at",)


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ("game_mode", "played_at", "created_by", "created_at")
    list_filter = ("game_mode", "played_at")
    search_fields = ("players__profile__name", "created_by__username")
    inlines = [MatchPlayerInline]


@admin.register(MatchPlayer)
class MatchPlayerAdmin(admin.ModelAdmin):
    list_display = ("match", "profile", "is_winner", "avg_score", "score", "total_darts")
    list_filter = ("is_winner", "match__game_mode")
    search_fields = ("profile__name",)
