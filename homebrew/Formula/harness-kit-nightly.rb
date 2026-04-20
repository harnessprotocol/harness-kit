class HarnessKitATNightly < Formula
  desc "Compile and validate harness.yaml for AI coding tools (nightly)"
  homepage "https://github.com/harnessprotocol/harness-kit"
  url "https://github.com/harnessprotocol/harness-kit/releases/download/nightly/harness-kit-nightly-darwin-arm64.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  version "00000000"

  depends_on arch: :arm64

  def install
    bin.install "harness-kit"
  end

  test do
    system bin/"harness-kit", "--version"
  end
end
