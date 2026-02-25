class Megasloth < Formula
  desc "AI-Powered DevOps automation agent for GitHub, GitLab, and Bitbucket"
  homepage "https://github.com/stronghuni/MegaSloth"
  url "https://github.com/stronghuni/MegaSloth/archive/refs/tags/v1.0.0.tar.gz"
  sha256 "" # Will be filled after creating release
  license "MIT"
  
  depends_on "node@22"
  depends_on "pnpm"
  depends_on "redis" => :optional

  def install
    system "pnpm", "install", "--frozen-lockfile"
    system "pnpm", "build"
    
    libexec.install Dir["*"]
    (bin/"megasloth").write_env_script libexec/"dist/cli/index.js", PATH: "#{HOMEBREW_PREFIX}/bin:$PATH"
  end

  def caveats
    <<~EOS
      MegaSloth has been installed!
      
      Initialize in a directory:
        megasloth init
      
      Start the agent:
        megasloth start
      
      Optional: Install Redis for job queue support
        brew install redis
        brew services start redis
      
      Documentation: https://github.com/stronghuni/MegaSloth
    EOS
  end

  test do
    system "#{bin}/megasloth", "--version"
  end
end
