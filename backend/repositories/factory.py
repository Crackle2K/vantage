"""Repository factory functions for dependency injection.

Provides factory functions that return the appropriate repository
instances for saved businesses and subscriptions. Currently all
factories return Supabase implementations, but the design allows
swapping in alternative backends (e.g., in-memory for testing).
"""
from backend.repositories.saved import SavedRepository, SupabaseSavedRepository
from backend.repositories.subscriptions import SubscriptionsRepository, SupabaseSubscriptionsRepository


def get_saved_read_repository() -> SavedRepository:
    """Return the read repository for saved businesses.

    Returns:
        SavedRepository: A Supabase-backed saved-business repository.
    """
    return SupabaseSavedRepository()


def get_saved_write_repositories() -> list[SavedRepository]:
    """Return the write repositories for saved businesses.

    Returns a list to support dual-write patterns (e.g., caching layer
    plus primary store).

    Returns:
        list[SavedRepository]: List of Supabase-backed repositories.
    """
    return [SupabaseSavedRepository()]


def get_subscriptions_read_repository() -> SubscriptionsRepository:
    """Return the read repository for subscriptions.

    Returns:
        SubscriptionsRepository: A Supabase-backed subscriptions repository.
    """
    return SupabaseSubscriptionsRepository()


def get_subscriptions_write_repositories() -> list[SubscriptionsRepository]:
    """Return the write repositories for subscriptions.

    Returns:
        list[SubscriptionsRepository]: List of Supabase-backed repositories.
    """
    return [SupabaseSubscriptionsRepository()]
