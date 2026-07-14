import os

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create or update the DartPlayr admin user from environment variables."

    def handle(self, *args, **options):
        username = os.environ.get("DARTPLAYR_ADMIN_USERNAME", "admin")
        password = os.environ.get("DARTPLAYR_ADMIN_PASSWORD")
        if not password:
            self.stdout.write(self.style.WARNING("DARTPLAYR_ADMIN_PASSWORD is not set; admin user was not changed."))
            return

        user, created = User.objects.get_or_create(username=username, defaults={"is_staff": True, "is_superuser": True})
        user.is_staff = True
        user.is_superuser = True
        user.set_password(password)
        user.save()
        action = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{action} admin user '{username}'."))
