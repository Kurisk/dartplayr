from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Match",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("game_mode", models.CharField(max_length=16)),
                ("game_options", models.JSONField(default=dict)),
                ("played_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="dartplayr_matches_created", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="PlayerProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=40)),
                ("name_slug", models.SlugField(max_length=48, unique=True)),
                ("color", models.CharField(default="#53d66a", max_length=16)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("games_played", models.PositiveIntegerField(default=0)),
                ("wins", models.PositiveIntegerField(default=0)),
                ("losses", models.PositiveIntegerField(default=0)),
                ("total01_darts", models.PositiveIntegerField(default=0)),
                ("total01_points", models.PositiveIntegerField(default=0)),
                ("best01_avg", models.FloatField(default=0)),
                ("best01_darts_to_win", models.PositiveIntegerField(blank=True, null=True)),
                ("busts", models.PositiveIntegerField(default=0)),
                ("ton100", models.PositiveIntegerField(default=0)),
                ("ton140", models.PositiveIntegerField(default=0)),
                ("ton180", models.PositiveIntegerField(default=0)),
                ("total_cricket_turns", models.PositiveIntegerField(default=0)),
                ("total_cricket_marks", models.PositiveIntegerField(default=0)),
                ("best_cricket_mpr", models.FloatField(default=0)),
                ("highest_cricket_score", models.PositiveIntegerField(default=0)),
                ("user", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="dartplayr_profile", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="MatchPlayer",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_winner", models.BooleanField(default=False)),
                ("score", models.IntegerField(default=0)),
                ("total_darts", models.PositiveIntegerField(default=0)),
                ("total_turns", models.PositiveIntegerField(default=0)),
                ("avg_score", models.FloatField(default=0)),
                ("best_turn", models.FloatField(default=0)),
                ("bust_count", models.PositiveIntegerField(default=0)),
                ("match", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="players", to="core.match")),
                ("profile", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="match_rows", to="core.playerprofile")),
            ],
            options={
                "unique_together": {("match", "profile")},
            },
        ),
    ]
