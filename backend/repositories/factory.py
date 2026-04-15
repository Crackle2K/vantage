from backend.repositories.saved import SavedRepository, SupabaseSavedRepository
from backend.repositories.subscriptions import SubscriptionsRepository, SupabaseSubscriptionsRepository


def get_saved_read_repository() -> SavedRepository:
    return SupabaseSavedRepository()


def get_saved_write_repositories() -> list[SavedRepository]:
    return [SupabaseSavedRepository()]


def get_subscriptions_read_repository() -> SubscriptionsRepository:
    return SupabaseSubscriptionsRepository()


def get_subscriptions_write_repositories() -> list[SubscriptionsRepository]:
    return [SupabaseSubscriptionsRepository()]
