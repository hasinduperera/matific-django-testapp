from django.urls import path
from .views import hello_world, health_check


urlpatterns = [
    path('', hello_world),
    path('health/', health_check)
]
