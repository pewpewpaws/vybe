import logging
from functools import lru_cache
from time import sleep

import httpx
from supabase import Client
from supabase._sync.client import SyncClient as SyncSupabaseClient
from supabase.lib.client_options import SyncClientOptions
from postgrest import SyncPostgrestClient
from postgrest._sync.request_builder import SyncQueryRequestBuilder, SyncSingleRequestBuilder

from backend.app.core.settings import get_settings


_POSTGREST_RETRYABLE_EXCEPTIONS = (httpx.ReadError, httpx.RequestError)
_POSTGREST_RETRY_ATTEMPTS = 3
_POSTGREST_RETRY_DELAY_SECONDS = 0.2


class CampusBeatsPostgrestClient(SyncPostgrestClient):
    def create_session(
        self,
        base_url: str,
        headers: dict[str, str],
        timeout: int | float | httpx.Timeout,
        verify: bool = True,
        proxy: str | None = None,
    ) -> httpx.Client:
        return httpx.Client(
            base_url=base_url,
            headers=headers,
            timeout=timeout,
            verify=verify,
            proxy=proxy,
            follow_redirects=True,
            http2=False,
        )


class VyneSupabaseClient(SyncSupabaseClient):
    @staticmethod
    def _init_postgrest_client(
        rest_url: str,
        headers: dict[str, str],
        schema: str,
        timeout: int | float | httpx.Timeout,
        verify: bool = True,
        proxy: str | None = None,
    ) -> SyncPostgrestClient:
        return CampusBeatsPostgrestClient(
            rest_url,
            headers=headers,
            schema=schema,
            timeout=timeout,
            verify=verify,
            proxy=proxy,
        )


_logger = logging.getLogger(__name__)


def _with_postgrest_retries(execute_fn):
    def wrapped(self, *args, **kwargs):
        last_error = None
        for attempt in range(1, _POSTGREST_RETRY_ATTEMPTS + 1):
            try:
                return execute_fn(self, *args, **kwargs)
            except _POSTGREST_RETRYABLE_EXCEPTIONS as exc:
                last_error = exc
                if attempt == _POSTGREST_RETRY_ATTEMPTS:
                    raise
                _logger.warning(
                    "Transient Supabase/PostgREST request error; "
                    "retrying attempt %d/%d: %s",
                    attempt,
                    _POSTGREST_RETRY_ATTEMPTS,
                    exc,
                )
                sleep(_POSTGREST_RETRY_DELAY_SECONDS * attempt)
        raise last_error

    return wrapped


if not getattr(SyncQueryRequestBuilder.execute, "_campusbeats_retry_wrapped", False):
    SyncQueryRequestBuilder.execute = _with_postgrest_retries(SyncQueryRequestBuilder.execute)
    SyncQueryRequestBuilder.execute._campusbeats_retry_wrapped = True

if not getattr(SyncSingleRequestBuilder.execute, "_campusbeats_retry_wrapped", False):
    SyncSingleRequestBuilder.execute = _with_postgrest_retries(SyncSingleRequestBuilder.execute)
    SyncSingleRequestBuilder.execute._campusbeats_retry_wrapped = True


@lru_cache
def get_supabase_client() -> Client:
    settings = get_settings()
    options = SyncClientOptions().replace(
        postgrest_client_timeout=settings.http_timeout_seconds,
    )
    return VyneSupabaseClient.create(
        settings.supabase_url,
        settings.supabase_service_role_key,
        options=options,
    )
