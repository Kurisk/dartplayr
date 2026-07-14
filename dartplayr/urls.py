from django.contrib import admin
from django.urls import path

from core import views


urlpatterns = [
    path("", views.index, name="index"),
    path("admin/", admin.site.urls),
    path("api/session/", views.session_view, name="api_session"),
    path("api/register/", views.register_view, name="api_register"),
    path("api/login/", views.login_view, name="api_login"),
    path("api/logout/", views.logout_view, name="api_logout"),
    path("api/profiles/", views.profile_create_view, name="api_profile_create"),
    path("api/profiles/<int:profile_id>/", views.profile_delete_view, name="api_profile_delete"),
    path("api/matches/", views.match_create_view, name="api_match_create"),
]
