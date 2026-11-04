"""Curated sources and editable developer topics. No credentials live here."""

FEEDS = [
    ("qbitai", "量子位", "https://www.qbitai.com/feed", "国内", True, ""),
    ("infoq", "InfoQ 中文", "https://www.infoq.cn/feed", "国内", True, ""),
    ("ruanyifeng", "阮一峰的网络日志", "https://www.ruanyifeng.com/blog/atom.xml", "国内", True, ""),
    ("openai", "OpenAI News", "https://openai.com/news/rss.xml", "官方", True, ""),
    ("huggingface", "Hugging Face", "https://huggingface.co/blog/feed.xml", "官方", True, ""),
    ("deepmind", "Google DeepMind", "https://deepmind.google/blog/rss.xml", "官方", True, ""),
    ("google-research", "Google Research", "https://research.google/blog/rss/", "官方", True, ""),
    ("techcrunch-ai", "TechCrunch AI", "https://techcrunch.com/category/artificial-intelligence/feed/", "国际", True, ""),
    ("hacker-news", "Hacker News", "https://hnrss.org/frontpage", "国际", True, ""),
    ("reddit-localllama", "r/LocalLLaMA", "https://www.reddit.com/r/LocalLLaMA/.rss?limit=25", "社区", True, ""),
    ("reddit-ml", "r/MachineLearning", "https://www.reddit.com/r/MachineLearning/.rss?limit=25", "社区", True, ""),
    ("arxiv-ai", "arXiv · cs.AI", "https://rss.arxiv.org/rss/cs.AI", "论文", False, "可选论文来源"),
    ("sspai", "少数派", "https://sspai.com/feed", "国内", False, "可选科技来源"),
    ("yahoo-finance", "雅虎财经", "https://finance.yahoo.com/news/rssindex", "国际", False, "2026-11-04 检查返回 404"),
    ("jiqizhixin", "机器之心", "https://www.jiqizhixin.com/rss", "国内", False, "待验证专用适配器：未解析到有效条目"),
    ("36kr", "36 氪", "https://36kr.com/feed", "国内", False, "待验证专用适配器：未解析到有效条目"),
    ("reddit-artificial", "r/artificial", "https://www.reddit.com/r/artificial/.rss?limit=25", "社区", False, "2026-11-04 检查返回 429"),
]
TOPICS = [
    ("models", "模型与研究", "模型,大模型,LLM,GPT,Claude,Gemini,GLM,DeepSeek,Qwen,Llama,OpenAI,Anthropic,transformer,benchmark", "#5c7d72"),
    ("coding", "AI 编程", "AI 编程,AI coding,coding agent,代码生成,Codex,Cursor,Copilot,Claude Code,软件工程", "#b1794e"),
    ("agents", "Agent 与自动化", "agent,智能体,MCP,自动化,tool calling,工具调用,workflow", "#6e7c9c"),
    ("opensource", "开源与工具", "开源,open source,open-source,Hugging Face,HuggingFace,Ollama,vLLM,推理引擎,模型部署,本地模型", "#8c7898"),
    ("products", "产品与实践", "人工智能,机器学习,AI,ChatGPT,RAG,提示词,prompt,多模态,语音,机器人,产品实践", "#918246"),
]
SETTINGS = {"interval_minutes": 60, "schedule_enabled": True, "brief_hour": 9,
            "ai_enabled": True, "auto_analyze_limit": 20, "initial_days": 7, "per_source_limit": 50}
