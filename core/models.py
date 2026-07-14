from django.conf import settings
from django.db import models
from django.utils.text import slugify


def profile_slug(name):
    return slugify(name or "").lower()


class PlayerProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dartplayr_profile",
    )
    name = models.CharField(max_length=40)
    name_slug = models.SlugField(max_length=48, unique=True)
    color = models.CharField(max_length=16, default="#53d66a")
    created_at = models.DateTimeField(auto_now_add=True)

    games_played = models.PositiveIntegerField(default=0)
    wins = models.PositiveIntegerField(default=0)
    losses = models.PositiveIntegerField(default=0)

    total01_darts = models.PositiveIntegerField(default=0)
    total01_points = models.PositiveIntegerField(default=0)
    best01_avg = models.FloatField(default=0)
    best01_darts_to_win = models.PositiveIntegerField(null=True, blank=True)
    busts = models.PositiveIntegerField(default=0)
    ton100 = models.PositiveIntegerField(default=0)
    ton140 = models.PositiveIntegerField(default=0)
    ton180 = models.PositiveIntegerField(default=0)

    total_cricket_turns = models.PositiveIntegerField(default=0)
    total_cricket_marks = models.PositiveIntegerField(default=0)
    best_cricket_mpr = models.FloatField(default=0)
    highest_cricket_score = models.PositiveIntegerField(default=0)

    def save(self, *args, **kwargs):
        if not self.name_slug:
            self.name_slug = profile_slug(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Match(models.Model):
    game_mode = models.CharField(max_length=16)
    game_options = models.JSONField(default=dict)
    played_at = models.DateTimeField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dartplayr_matches_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.game_mode} on {self.played_at:%Y-%m-%d}"


class MatchPlayer(models.Model):
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name="players")
    profile = models.ForeignKey(PlayerProfile, on_delete=models.CASCADE, related_name="match_rows")
    is_winner = models.BooleanField(default=False)
    score = models.IntegerField(default=0)
    total_darts = models.PositiveIntegerField(default=0)
    total_turns = models.PositiveIntegerField(default=0)
    avg_score = models.FloatField(default=0)
    best_turn = models.FloatField(default=0)
    bust_count = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("match", "profile")

    def __str__(self):
        result = "winner" if self.is_winner else "player"
        return f"{self.profile.name} ({result})"
