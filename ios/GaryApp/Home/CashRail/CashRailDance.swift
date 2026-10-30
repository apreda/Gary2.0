import Foundation

/// The celebration's choreography as plain math, ported from the approved mock
/// (.superpowers/brainstorm/…/dances-10.html): when each frame shows, how it
/// cross-fades, and how it moves. Everything is a function of the seconds since
/// the celebration opened, so the view just samples it every display frame.
enum CashRailDance {
    /// When the routine starts: the backdrop slams in first.
    static let lead = 0.28
    /// A new frame fades in (and the old one out) over 90ms.
    static let fade = 0.09
    /// A new frame starts from where the last one stood and eases into its
    /// own move over this long, so a swap never jumps (the smoother pass,
    /// founder Oct 30 2026).
    static let handoff = 0.1
    /// The last pose keeps breathing instead of freezing.
    static let breath = (period: 1.1, depth: 0.012)

    /// 0→1 with no corners at either end.
    static func smooth(_ x: Double) -> Double {
        let t = min(1, max(0, x))
        return t * t * (3 - 2 * t)
    }
    /// A move never runs longer than this, however long the frame holds.
    static let maxMove = 0.52

    /// A pose offset. Translations are fractions of the frame's own size;
    /// scale and rotation pivot on the bottom center, where Gary stands.
    struct Pose: Equatable {
        var tx = 0.0, ty = 0.0, sx = 1.0, sy = 1.0, rot = 0.0
        static let rest = Pose()

        static func mix(_ a: Pose, _ b: Pose, _ t: Double) -> Pose {
            Pose(tx: a.tx + (b.tx - a.tx) * t, ty: a.ty + (b.ty - a.ty) * t,
                 sx: a.sx + (b.sx - a.sx) * t, sy: a.sy + (b.sy - a.sy) * t,
                 rot: a.rot + (b.rot - a.rot) * t)
        }
    }

    /// A CSS cubic-bezier timing curve; y may overshoot past 1.
    struct Ease {
        let x1, y1, x2, y2: Double
        init(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) { self.x1 = x1; self.y1 = y1; self.x2 = x2; self.y2 = y2 }
        static let move = Ease(0.3, 1.2, 0.5, 1)
        static let slam = Ease(0.3, 1.4, 0.5, 1)
        static let punch = Ease(0.3, 1.5, 0.5, 1)
        static let fall = Ease(0.3, 0.1, 0.6, 1)

        private func bez(_ t: Double, _ a: Double, _ b: Double) -> Double {
            let u = 1 - t
            return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t
        }
        func callAsFunction(_ x: Double) -> Double {
            if x <= 0 { return 0 }
            if x >= 1 { return 1 }
            var lo = 0.0, hi = 1.0, t = x
            for _ in 0..<40 {
                let v = bez(t, x1, x2)
                if abs(v - x) < 1e-7 { break }
                if v < x { lo = t } else { hi = t }
                t = (lo + hi) / 2
            }
            return bez(t, y1, y2)
        }
    }

    /// Keyframes with offsets; between them the pose is linear, and past the
    /// ends (an overshooting curve) the nearest segment extends.
    static func sample(_ frames: [(Double, Pose)], _ p: Double) -> Pose {
        guard frames.count > 1 else { return frames.first?.1 ?? .rest }
        var i = 0
        while i < frames.count - 2 && p >= frames[i + 1].0 { i += 1 }
        let (o0, a) = frames[i], (o1, b) = frames[i + 1]
        return Pose.mix(a, b, (p - o0) / (o1 - o0))
    }

    private static func k(_ o: Double, tx: Double = 0, ty: Double = 0, sx: Double = 1, sy: Double = 1, s: Double? = nil, rot: Double = 0) -> (Double, Pose) {
        (o, Pose(tx: tx, ty: ty, sx: s ?? sx, sy: s ?? sy, rot: rot))
    }

    static let moves: [String: [(Double, Pose)]] = [
        "hop": [k(0, ty: -0.03), k(1)],
        "drop": [k(0, ty: -0.02, sy: 1.02), k(0.5, sx: 1.03, sy: 0.97), k(1)],
        "rise": [k(0, ty: 0.02), k(1, ty: -0.02)],
        "pop": [k(0, s: 0.95), k(0.4, s: 1.05), k(1)],
        "hit": [k(0, s: 1.04, rot: -1.5), k(1)],
        "freeze": [k(0, tx: -0.03), k(0.15, tx: 0.01), k(1)],
        "left": [k(0, tx: 0.05), k(0.5, tx: -0.04, ty: -0.02), k(1, tx: -0.04)],
        "right": [k(0, tx: -0.05), k(0.5, tx: 0.04, ty: -0.02), k(1, tx: 0.04)],
        "run": [k(0, ty: 0.25, s: 0.9), k(1)],
        "air": [k(0), k(0.5, ty: -0.22, rot: -4), k(1, ty: -0.06)],
        "land": [k(0, ty: -0.06), k(0.25, sx: 1.05, sy: 0.93), k(1)],
        "shake": [k(0, s: 1.04), k(1)],
    ]

    /// The pose of a move at eased progress `progress`; an unknown or empty move rests.
    static func pose(move: String, progress: Double) -> Pose {
        guard let frames = moves[move] else { return .rest }
        return sample(frames, progress)
    }

    /// Moves that hit the ground hard enough to shake the scene and flash it.
    static func isImpact(_ move: String) -> Bool { move == "shake" || move == "land" }

    struct Timeline {
        let seq: [CashRailCelebration.Step]
        /// Each step's start, in whole milliseconds, so beats land exactly.
        let startsMs: [Int]

        init(seq: [CashRailCelebration.Step]) {
            self.seq = seq
            var t = Int(CashRailDance.lead * 1000), s: [Int] = []
            for step in seq { s.append(t); t += step.hold }
            startsMs = s
            endMs = t
        }
        private let endMs: Int

        var lastStart: Double { Double(startsMs.last ?? endMs) / 1000 }
        var end: Double { Double(endMs) / 1000 }
        func start(_ i: Int) -> Double { Double(startsMs[i]) / 1000 }

        private func ms(_ t: Double) -> Double { (t * 1_000_000).rounded() / 1000 }

        /// The step on screen at `t`; nil before the first beat, the last step after the end.
        func step(at t: Double) -> Int? {
            let m = ms(t)
            guard let first = startsMs.first, m >= Double(first) else { return nil }
            return startsMs.lastIndex { Double($0) <= m }
        }

        /// Seconds since step `i` began, at `t`.
        private func local(_ i: Int, _ t: Double) -> Double { (ms(t) - Double(startsMs[i])) / 1000 }

        func opacity(_ slug: String, at t: Double) -> Double {
            guard let i = step(at: t) else { return 0 }
            let prev = i > 0 ? seq[i - 1].slug : nil
            let f = CashRailDance.smooth(local(i, t) / CashRailDance.fade)
            if seq[i].slug == slug { return prev == slug ? 1 : f }
            if prev == slug { return 1 - f }
            return 0
        }

        /// A frame holds the end of its own latest move until it is shown again.
        /// Each showing hands off from the pose on screen just before it, and
        /// the last one breathes once its move is done.
        func pose(_ slug: String, at t: Double) -> Pose {
            guard let i = step(at: t), let j = (0...i).last(where: { seq[$0].slug == slug }) else { return .rest }
            let dur = min(Double(seq[j].hold) / 1000, CashRailDance.maxMove)
            let since = local(j, t)
            var pose = CashRailDance.pose(move: seq[j].move, progress: Ease.move(min(1, max(0, since / dur))))
            if j == seq.count - 1, since > dur {
                let b = sin(2 * .pi * (since - dur) / CashRailDance.breath.period) * CashRailDance.breath.depth
                pose.sy *= 1 + b
                pose.sx *= 1 - b / 2
            }
            if j > 0, since < CashRailDance.handoff {
                let before = self.pose(seq[j - 1].slug, at: start(j) - 0.0001)
                pose = Pose.mix(before, pose, CashRailDance.smooth(since / CashRailDance.handoff))
            }
            return pose
        }

        /// Seconds since the latest impact move began, if one has.
        func sinceImpact(at t: Double) -> Double? {
            guard let i = step(at: t), let j = (0...i).last(where: { CashRailDance.isImpact(seq[$0].move) }) else { return nil }
            return local(j, t)
        }
    }

    /// A trimmed figure: its box in canvas pixels and its center of mass as a
    /// fraction of the box width, so every frame can stand on one spot.
    struct Figure: Equatable {
        let minX, minY, maxX, maxY: Int
        let cx: Double
    }

    /// The figure inside a frame's alpha channel (row-major, one byte a pixel).
    /// Pixels at or under `threshold` are glow and fringe, not Gary.
    static func figure(alpha: [UInt8], width: Int, height: Int, threshold: UInt8 = 40) -> Figure? {
        var minX = width, minY = height, maxX = -1, maxY = -1
        var mass = 0.0, moment = 0.0
        for y in 0..<height {
            let row = y * width
            for x in 0..<width {
                let a = alpha[row + x]
                guard a > threshold else { continue }
                if x < minX { minX = x }
                if x > maxX { maxX = x }
                if y < minY { minY = y }
                if y > maxY { maxY = y }
                mass += Double(a); moment += Double(a) * Double(x)
            }
        }
        guard maxX >= minX, maxY >= minY, mass > 0 else { return nil }
        let w = Double(maxX - minX + 1)
        return Figure(minX: minX, minY: minY, maxX: maxX, maxY: maxY, cx: (moment / mass - Double(minX) + 0.5) / w)
    }
}
