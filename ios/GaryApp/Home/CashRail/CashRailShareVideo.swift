import AVFoundation
import SwiftUI

/// One frame of the shared video: the card itself, on the app's black, with our address under it.
private struct CashRailShareFrame: View {
    let reel: CashRailReel
    let t: Double

    var body: some View {
        VStack(spacing: 14) {
            CashRailCelebrationCard(reel: reel, t: t, width: 324, sceneH: 486, motion: true)
            Text("betwithgary.ai")
                .font(GaryFonts.mono(12.5))
                .foregroundStyle(GaryColors.gold.opacity(0.8))
        }
        .frame(width: CashRailShareVideo.canvas.width, height: CashRailShareVideo.canvas.height)
        .background(Color(hex: "#090808"))
    }
}

/// Turns a celebration into a 1080×1920 video, frame by frame, with the same
/// card the app plays, so what gets shared moves the way it moved on screen.
@MainActor
enum CashRailShareVideo {
    fileprivate static let canvas = CGSize(width: 360, height: 640)
    private static let scale = 3
    private static let fps: Int32 = 30
    /// The last pose stays up this long after the dance, so it doesn't cut off mid-confetti.
    private static let hold = 1.2

    /// Nil if it couldn't be made or was cancelled. The file is the caller's to remove.
    static func make(_ reel: CashRailReel) async -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(reel.celebration.shareFilename)
        try? FileManager.default.removeItem(at: url)
        let (w, h) = (Int(canvas.width) * scale, Int(canvas.height) * scale)
        guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return nil }
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: w,
            AVVideoHeightKey: h,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 6_000_000],
            AVVideoColorPropertiesKey: [
                AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
            ],
        ])
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: w,
            kCVPixelBufferHeightKey as String: h,
        ])
        writer.add(input)
        guard writer.startWriting() else { return nil }
        writer.startSession(atSourceTime: .zero)

        func abandon() -> URL? {
            writer.cancelWriting()
            try? FileManager.default.removeItem(at: url)
            return nil
        }
        let tl = reel.timeline
        let count = Int(((tl.end + hold) * Double(fps)).rounded(.up))
        // The first frame is what a text thread shows before anyone taps play: Gary mid-dance,
        // not the empty card the slam starts from. Where the video loops it lands on the same pose.
        let poster = tl.lastStart + 0.5
        for i in 0...count {
            while !input.isReadyForMoreMediaData {
                guard writer.status == .writing, !Task.isCancelled else { return abandon() }
                try? await Task.sleep(nanoseconds: 5_000_000)
            }
            guard !Task.isCancelled else { return abandon() }
            let t = i == 0 ? poster : Double(i - 1) / Double(fps)
            let appended: Bool = autoreleasepool {
                let renderer = ImageRenderer(content: CashRailShareFrame(reel: reel, t: t))
                renderer.scale = CGFloat(scale)
                renderer.isOpaque = true
                guard let cg = renderer.cgImage, let pool = adaptor.pixelBufferPool,
                      let buffer = pixelBuffer(cg, pool: pool) else { return false }
                return adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
            }
            guard appended else { return abandon() }
            await Task.yield()
        }
        input.markAsFinished()
        await writer.finishWriting()
        return writer.status == .completed ? url : abandon()
    }

    private static func pixelBuffer(_ cg: CGImage, pool: CVPixelBufferPool) -> CVPixelBuffer? {
        var out: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &out) == kCVReturnSuccess, let buffer = out else { return nil }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        let info = CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        guard let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: cg.width, height: cg.height,
                                  bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: info) else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        return buffer
    }
}
