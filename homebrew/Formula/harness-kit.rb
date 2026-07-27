class HarnessKit < Formula
  desc "Compile and validate harness.yaml for AI coding tools"
  homepage "https://github.com/harnessprotocol/harness-kit"
  # `version` must be declared before it's interpolated into `url` below —
  # Homebrew's formula DSL evaluates the class body top-to-bottom, so a `url`
  # referencing #{version} above its `version` line resolves against nil and
  # silently degrades to a malformed download URL.
  version "0.1.0"
  url "https://github.com/harnessprotocol/harness-kit/releases/download/v#{version}/harness-kit-v#{version}-darwin-arm64.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  license "Apache-2.0"

  depends_on arch: :arm64

  def install
    bin.install "harness-kit"
    # `harness` is a shorter alias for the same binary — README examples and
    # docs use it interchangeably with `harness-kit`.
    bin.install_symlink "harness-kit" => "harness"
  end

  test do
    system bin/"harness-kit", "--version"
  end
end
