from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Chatwoot configuration
    CHATWOOT_BASE_URL: str = "https://app.chatwoot.com"
    CHATWOOT_API_TOKEN: str = "dummy_token"
    CHATWOOT_ACCOUNT_ID: int = 1
    CHATWOOT_WEBHOOK_SECRET: str = ""
    CHATWOOT_ESCALATION_TEAM_ID: int = 1

    # AI Gateway (9Router) configuration
    NINEROUTER_BASE_URL: str = "http://localhost:20128/v1"
    NINEROUTER_API_KEY: str = "dummy_key"
    AI_MODEL: str = "gpt-4o-mini"

    # Escalation & Entry Triggers
    ESCALATION_KEYWORDS: str = "alergi,komplain,darurat,refund,bicara sama orang,urgent"
    CS_ENTRY_TRIGGERS: str = "customer service,cs,bantuan"

    @property
    def escalation_keywords_list(self) -> list[str]:
        return [k.strip().lower() for k in self.ESCALATION_KEYWORDS.split(",") if k.strip()]

    @property
    def cs_entry_triggers_list(self) -> list[str]:
        return [k.strip().lower() for k in self.CS_ENTRY_TRIGGERS.split(",") if k.strip()]

    model_config = {"env_file": ".env"}

# Global settings instance
settings = Settings()
