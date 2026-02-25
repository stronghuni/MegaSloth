import gradio as gr
import subprocess
import os
import json
from typing import List, Tuple

def initialize_megasloth():
    """Initialize MegaSloth in demo mode"""
    # Set demo environment
    os.environ['MEGASLOTH_DEMO'] = 'true'
    os.environ['LLM_PROVIDER'] = 'openai'  # Can be changed based on available API keys
    return "MegaSloth initialized in demo mode"

def chat_with_agent(message: str, history: List[Tuple[str, str]]) -> str:
    """
    Send message to MegaSloth agent
    Note: In production, this would connect to actual agent via HTTP API
    For demo purposes, we simulate responses
    """
    
    # Simulate agent responses based on common queries
    responses = {
        "help": """I'm MegaSloth 🦥, an AI-powered DevOps automation agent.

I can help you with:
• PR Code Reviews with auto-fix suggestions
• CI/CD Failure Diagnosis and fixes
• Issue Triage with smart labeling
• Dependency Updates via automated PRs
• Documentation Sync when code changes
• Test Generation for new code
• Release Automation with changelogs
• Repository Health Reports

Ask me about any of these tasks!""",
        
        "pr": """I can review pull requests automatically!

When a PR is opened, I:
1. Analyze the code changes
2. Check for potential bugs, security issues, and code quality
3. Suggest improvements and fixes
4. Can automatically create fix commits if requested

Example: "Review PR #123 in stronghuni/MegaSloth" """,
        
        "ci": """I diagnose and fix CI/CD failures!

When a CI job fails, I:
1. Fetch the failure logs
2. Analyze the error messages
3. Determine root cause (dependency issue, test failure, etc.)
4. Propose a fix or create a PR with the solution

Example: "Fix the failing CI in workflow 'build-and-test'" """,
        
        "install": """To install MegaSloth locally:

**One-line install (macOS/Linux):**
```bash
curl -fsSL https://raw.githubusercontent.com/stronghuni/MegaSloth/main/install.sh | bash
```

**Or via npm:**
```bash
npm install -g megasloth
megasloth init
megasloth start
```

**Desktop App:**
Download from https://github.com/stronghuni/MegaSloth/releases

Configure your LLM API key in Settings, and you're ready to go!"""
    }
    
    # Simple keyword matching for demo
    msg_lower = message.lower()
    
    if "help" in msg_lower or "what can you do" in msg_lower:
        return responses["help"]
    elif "pr" in msg_lower or "pull request" in msg_lower or "review" in msg_lower:
        return responses["pr"]
    elif "ci" in msg_lower or "pipeline" in msg_lower or "build" in msg_lower or "fail" in msg_lower:
        return responses["ci"]
    elif "install" in msg_lower or "setup" in msg_lower or "how to use" in msg_lower:
        return responses["install"]
    else:
        return f"""I understand you want to know about: "{message}"

In production, I would:
1. Connect to your GitHub/GitLab/Bitbucket repository
2. Execute the task using my 84 built-in tools
3. Use AI (Claude, OpenAI, or Gemini) to make intelligent decisions
4. Report back with results and actions taken

To try MegaSloth for real, install it locally:
https://github.com/stronghuni/MegaSloth

Ask me about: PR reviews, CI fixes, issue triage, or installation."""

# Create Gradio interface
with gr.Blocks(theme=gr.themes.Soft()) as demo:
    gr.Markdown("""
    # 🦥 MegaSloth - AI DevOps Agent
    
    **Self-hosted AI agent that automates GitHub, GitLab & Bitbucket workflows**
    
    This is a demo interface. For full functionality, [install MegaSloth locally](https://github.com/stronghuni/MegaSloth).
    """)
    
    chatbot = gr.Chatbot(
        label="Chat with MegaSloth",
        height=400,
        show_label=True,
        avatar_images=(None, "🦥")
    )
    
    msg = gr.Textbox(
        label="Ask MegaSloth anything",
        placeholder="Try: 'What can you do?' or 'How do I install you?'",
        show_label=True
    )
    
    with gr.Row():
        clear = gr.Button("Clear")
        submit = gr.Button("Send", variant="primary")
    
    gr.Examples(
        examples=[
            "What can you do?",
            "How do I review a pull request?",
            "Fix a failing CI pipeline",
            "How to install MegaSloth?",
            "Show me repository health metrics"
        ],
        inputs=msg,
        label="Example questions"
    )
    
    gr.Markdown("""
    ---
    
    ### 🚀 Features
    - **PR Code Review** with auto-fix suggestions
    - **CI/CD Diagnosis** and automated repair
    - **Issue Triage** with smart labeling
    - **Dependency Updates** via automated PRs
    - **Test Generation** for new code
    - **Release Automation** with changelogs
    
    ### 🛠️ Tech Stack
    - TypeScript + Node.js 22+
    - Multi-LLM: Claude, OpenAI, Gemini
    - 84 built-in tools
    - Desktop app (Electron) + CLI
    
    ### 📦 Install Locally
    ```bash
    curl -fsSL https://raw.githubusercontent.com/stronghuni/MegaSloth/main/install.sh | bash
    ```
    
    Or download the [desktop app](https://github.com/stronghuni/MegaSloth/releases).
    
    ### 🔗 Links
    - [GitHub Repository](https://github.com/stronghuni/MegaSloth)
    - [Documentation](https://github.com/stronghuni/MegaSloth#readme)
    - [Report Issues](https://github.com/stronghuni/MegaSloth/issues)
    """)
    
    def respond(message, chat_history):
        bot_message = chat_with_agent(message, chat_history)
        chat_history.append((message, bot_message))
        return "", chat_history
    
    msg.submit(respond, [msg, chatbot], [msg, chatbot])
    submit.click(respond, [msg, chatbot], [msg, chatbot])
    clear.click(lambda: None, None, chatbot, queue=False)

# Initialize on startup
initialize_megasloth()

if __name__ == "__main__":
    demo.launch()
