import Foundation

/// What Gary does next on Home (founder, Oct 30 2026: "a live character who is fluid, does his own thing").
/// `GaryLife` runs it: a stand of a few seconds, then a clip, chosen here. Pure, so it can be tested.
enum GaryLifePlan {
    /// A clip and its odds after a good night and after a bad one.
    struct Clip: Equatable {
        let name: String
        let good: Double
        let bad: Double
    }

    /// Every clip he has, by the bundled file's name.
    static let clips: [Clip] = [
        Clip(name: "gary-cigar", good: 3, bad: 1),
        Clip(name: "gary-paper", good: 1, bad: 3),
        Clip(name: "gary-watch", good: 1, bad: 2),
        Clip(name: "gary-pencil", good: 1, bad: 2),
        Clip(name: "gary-cash", good: 3, bad: 0.5),
        Clip(name: "gary-chuckle", good: 3, bad: 0.5),
    ]

    /// The next clip: never one of the last two he played (when there are others to play), weighted by last
    /// night's face. `roll` is a number in 0..<1.
    static func next(from clips: [Clip], recent: [String], mood: String?, roll: Double) -> String? {
        let fresh = Set(recent.suffix(min(2, max(0, clips.count - 1))))
        let pool = clips.filter { !fresh.contains($0.name) }
        guard !pool.isEmpty else { return nil }
        let good = mood == "GaryFire" || mood == "GaryCooking"
        let bad = mood == "GaryIceCold" || mood == "GaryDoomsday"
        let weights = pool.map { good ? $0.good : bad ? $0.bad : 1 }
        var left = roll * weights.reduce(0, +)
        for (clip, w) in zip(pool, weights) {
            if left < w { return clip.name }
            left -= w
        }
        return pool.last?.name
    }

    /// Seconds he stands before the next clip: a short beat when Home opens, a few seconds after that.
    static func stand(first: Bool, roll: Double) -> Double {
        first ? 1.5 + roll * 1.5 : 2.5 + roll * 4.5
    }
}
