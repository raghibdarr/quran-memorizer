import AVFoundation
import Capacitor
import MediaPlayer
import UIKit

// The recitation player for iOS (roadmap #01), the counterpart of
// android/…/audio/RecitationEngine.java: the page hands over a whole queue once and
// this plays it natively — screen off, lock-screen and headphone controls — with no
// JavaScript involved. Pauses between ayahs play real silence, so iOS keeps the app
// awake through them (a silent app in the background gets suspended).

/// The app's bridge, with the app-local plugins registered
class TakrarBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(RecitationPlayerPlugin())
    }
}

final class RecitationEngine {
    struct Item {
        let url: URL
        let startMs: Double
        let endMs: Double?
        let title: String
        let subtitle: String
        let tag: String
    }

    static let shared = RecitationEngine()

    var onItem: ((Int, String) -> Void)?
    var onState: ((Bool, Bool) -> Void)?
    var onProgress: ((Int, Double, Double) -> Void)?
    var onEnded: ((String) -> Void)?
    var onError: ((String) -> Void)?

    private let player = AVPlayer()
    private var items: [Item] = []
    private(set) var index = 0
    private var pauseMs: Double = 0
    private var loop = false
    private var rate: Float = 1
    private var wantsPlay = false
    private var inGap = false
    /// The ayah ended with "sleep at the end of this ayah": play resumes from the next
    private var resumeAtNext = false
    private var sleepAfterItem = false
    private var sleepAt: Date?
    private var sleepTimer: Timer?
    private var fadeTimer: Timer?
    private var fadeMs: Double = 8000
    private var endObserver: NSObjectProtocol?
    private var timeObserver: Any?
    private var statusObservation: NSKeyValueObservation?
    private var itemStatusObservation: NSKeyValueObservation?

    private init() {
        player.automaticallyWaitsToMinimizeStalling = true
        statusObservation = player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.emitState() }
        }
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 4), queue: .main) { [weak self] _ in
            self?.emitProgress()
        }
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
        setUpRemoteCommands()
    }

    // MARK: queue

    func setQueue(_ next: [Item], startIndex: Int, startPositionMs: Double, pauseBetweenMs: Double, loopQueue: Bool, rate newRate: Float, autoplay: Bool) {
        cancelSleep()
        items = next
        pauseMs = max(0, pauseBetweenMs)
        loop = loopQueue
        rate = newRate
        resumeAtNext = false
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, options: [])
        try? session.setActive(true)
        index = max(0, min(startIndex, items.count - 1))
        load(index, offsetMs: startPositionMs)
        if autoplay { play() } else { wantsPlay = false; emitState() }
    }

    private func load(_ i: Int, offsetMs: Double = 0) {
        inGap = false
        let it = items[i]
        let av = AVPlayerItem(url: it.url)
        av.audioTimePitchAlgorithm = .timeDomain
        if let end = it.endMs { av.forwardPlaybackEndTime = CMTime(value: CMTimeValue(end), timescale: 1000) }
        watchEnd(of: av)
        itemStatusObservation = av.observe(\.status, options: [.new]) { [weak self] item, _ in
            if item.status == .failed {
                DispatchQueue.main.async { self?.onError?(item.error?.localizedDescription ?? "Playback failed") }
            }
        }
        player.replaceCurrentItem(with: av)
        let start = it.startMs + offsetMs
        if start > 0 {
            player.seek(to: CMTime(value: CMTimeValue(start), timescale: 1000), toleranceBefore: .zero, toleranceAfter: .zero)
        }
        onItem?(i, it.tag)
        updateNowPlaying()
    }

    private func watchEnd(of item: AVPlayerItem) {
        if let o = endObserver { NotificationCenter.default.removeObserver(o) }
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            self?.itemEnded()
        }
    }

    private func itemEnded() {
        if inGap { advance(); return }
        if sleepAfterItem {
            sleepAfterItem = false
            resumeAtNext = true
            wantsPlay = false
            player.pause()
            onEnded?("sleep")
            return
        }
        if pauseMs > 0 && (index + 1 < items.count || loop) { playSilence(ms: pauseMs) } else { advance() }
    }

    private func advance() {
        if index + 1 < items.count {
            index += 1
        } else if loop && !items.isEmpty {
            index = 0
        } else {
            wantsPlay = false
            player.pause()
            onEnded?("queue")
            emitState()
            return
        }
        load(index)
        if wantsPlay { player.playImmediately(atRate: rate) }
    }

    private func playSilence(ms: Double) {
        guard let url = RecitationEngine.silenceFile(ms: ms) else { advance(); return }
        inGap = true
        let av = AVPlayerItem(url: url)
        watchEnd(of: av)
        player.replaceCurrentItem(with: av)
        if wantsPlay { player.playImmediately(atRate: 1) }
    }

    /// A silent WAV of the given length, written once to the caches folder
    private static func silenceFile(ms: Double) -> URL? {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let url = dir.appendingPathComponent("silence-\(Int(ms)).wav")
        if FileManager.default.fileExists(atPath: url.path) { return url }
        let sampleRate: UInt32 = 8000
        let samples = UInt32(Double(sampleRate) * ms / 1000)
        var data = Data()
        func put32(_ v: UInt32) { var x = v.littleEndian; data.append(Data(bytes: &x, count: 4)) }
        func put16(_ v: UInt16) { var x = v.littleEndian; data.append(Data(bytes: &x, count: 2)) }
        data.append("RIFF".data(using: .ascii)!)
        put32(36 + samples * 2)
        data.append("WAVEfmt ".data(using: .ascii)!)
        put32(16); put16(1); put16(1); put32(sampleRate); put32(sampleRate * 2); put16(2); put16(16)
        data.append("data".data(using: .ascii)!)
        put32(samples * 2)
        data.append(Data(count: Int(samples) * 2))
        do { try data.write(to: url) } catch { return nil }
        return url
    }

    // MARK: transport

    func play() {
        if items.isEmpty { return }
        if resumeAtNext {
            resumeAtNext = false
            wantsPlay = true
            advance()
            return
        }
        wantsPlay = true
        player.volume = 1
        player.playImmediately(atRate: inGap ? 1 : rate)
    }

    func pause() {
        wantsPlay = false
        player.pause()
    }

    func stop() {
        cancelSleep()
        wantsPlay = false
        player.pause()
        player.replaceCurrentItem(with: nil)
        items = []
        index = 0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        emitState()
    }

    func seekToItem(_ i: Int, positionMs: Double) {
        guard i >= 0 && i < items.count else { return }
        index = i
        load(i, offsetMs: positionMs)
        if wantsPlay { player.playImmediately(atRate: rate) }
    }

    func setRate(_ r: Float) {
        rate = r
        if player.timeControlStatus != .paused && !inGap { player.rate = r }
    }

    // MARK: sleep timer

    /// minutes > 0: fade out and pause after that long; 0: at the end of this item; < 0: off
    func setSleepTimer(minutes: Double, fadeOutMs: Double) {
        cancelSleep()
        fadeMs = max(0, fadeOutMs)
        if minutes > 0 {
            sleepAt = Date().addingTimeInterval(minutes * 60)
            sleepTimer = Timer.scheduledTimer(withTimeInterval: minutes * 60, repeats: false) { [weak self] _ in self?.fadeOut() }
        } else if minutes == 0 {
            sleepAfterItem = true
        }
    }

    var sleepRemainingMs: Double {
        if let at = sleepAt { return max(0, at.timeIntervalSinceNow * 1000) }
        return sleepAfterItem ? 0 : -1
    }

    private func cancelSleep() {
        sleepTimer?.invalidate(); sleepTimer = nil
        fadeTimer?.invalidate(); fadeTimer = nil
        sleepAt = nil
        sleepAfterItem = false
        player.volume = 1
    }

    private func fadeOut() {
        sleepAt = nil
        let steps = max(1, Int(fadeMs / 100))
        var step = 0
        fadeTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] t in
            guard let self = self else { t.invalidate(); return }
            step += 1
            self.player.volume = max(0, 1 - Float(step) / Float(steps))
            if step >= steps {
                t.invalidate()
                self.fadeTimer = nil
                self.pause()
                self.player.volume = 1
                self.onEnded?("sleep")
            }
        }
    }

    // MARK: events

    private func emitState() {
        let playing = player.timeControlStatus == .playing
        let buffering = player.timeControlStatus == .waitingToPlayAtSpecifiedRate
        onState?(playing || (wantsPlay && inGap), buffering)
        updateNowPlaying()
    }

    private func emitProgress() {
        guard !inGap, index < items.count, player.currentItem != nil else { return }
        let it = items[index]
        let pos = max(0, player.currentTime().seconds * 1000 - it.startMs)
        var dur = -1.0
        if let end = it.endMs { dur = end - it.startMs } else if let d = player.currentItem?.duration.seconds, d.isFinite { dur = d * 1000 }
        onProgress?(index, pos.isFinite ? pos : 0, dur)
    }

    var positionMs: Double {
        guard index < items.count, !inGap else { return 0 }
        let p = player.currentTime().seconds * 1000 - items[index].startMs
        return p.isFinite ? max(0, p) : 0
    }

    var isPlaying: Bool { player.timeControlStatus == .playing || (wantsPlay && inGap) }
    var count: Int { items.count }
    func tag(at i: Int) -> String? { i >= 0 && i < items.count ? items[i].tag : nil }

    // MARK: lock screen and headphones

    private func updateNowPlaying() {
        guard index < items.count else { return }
        let it = items[index]
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: it.title,
            MPMediaItemPropertyArtist: it.subtitle,
            MPMediaItemPropertyAlbumTitle: "Takrar",
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? Double(rate) : 0.0,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: positionMs / 1000,
        ]
        if let end = it.endMs { info[MPMediaItemPropertyPlaybackDuration] = (end - it.startMs) / 1000 }
        if let icon = UIImage(named: "AppIcon") {
            info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: icon.size) { _ in icon }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func setUpRemoteCommands() {
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.addTarget { [weak self] _ in self?.play(); return .success }
        c.pauseCommand.addTarget { [weak self] _ in self?.pause(); return .success }
        c.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            if self.isPlaying { self.pause() } else { self.play() }
            return .success
        }
        c.nextTrackCommand.addTarget { [weak self] _ in self?.advance(); return .success }
        c.previousTrackCommand.addTarget { [weak self] _ in
            guard let self = self, !self.items.isEmpty else { return .commandFailed }
            self.seekToItem(max(0, self.index - 1), positionMs: 0)
            return .success
        }
    }

    @objc private func interrupted(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        if type == .ended, wantsPlay,
           let o = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt,
           AVAudioSession.InterruptionOptions(rawValue: o).contains(.shouldResume) {
            player.playImmediately(atRate: inGap ? 1 : rate)
        }
    }

    @objc private func routeChanged(_ note: Notification) {
        // Headphones unplugged: pause, as every audio app does
        guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
        DispatchQueue.main.async { self.pause() }
    }
}

@objc(RecitationPlayerPlugin)
public class RecitationPlayerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RecitationPlayerPlugin"
    public let jsName = "RecitationPlayer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setQueue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seekToItem", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSleepTimer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
    ]

    private var engine: RecitationEngine { RecitationEngine.shared }

    override public func load() {
        let e = RecitationEngine.shared
        e.onItem = { [weak self] i, tag in self?.notifyListeners("item", data: ["index": i, "tag": tag]) }
        e.onState = { [weak self] playing, buffering in self?.notifyListeners("state", data: ["playing": playing, "buffering": buffering]) }
        e.onProgress = { [weak self] i, pos, dur in
            self?.notifyListeners("progress", data: ["index": i, "positionMs": pos, "durationMs": dur, "at": Date().timeIntervalSince1970 * 1000])
        }
        e.onEnded = { [weak self] reason in self?.notifyListeners("ended", data: ["reason": reason]) }
        e.onError = { [weak self] message in self?.notifyListeners("error", data: ["message": message]) }
    }

    @objc func setQueue(_ call: CAPPluginCall) {
        let raw = call.getArray("items", JSObject.self) ?? []
        var items: [RecitationEngine.Item] = []
        for (i, o) in raw.enumerated() {
            guard let s = o["url"] as? String, let url = URL(string: s) else { continue }
            items.append(RecitationEngine.Item(
                url: url,
                startMs: (o["startMs"] as? NSNumber)?.doubleValue ?? 0,
                endMs: (o["endMs"] as? NSNumber)?.doubleValue,
                title: o["title"] as? String ?? "",
                subtitle: o["subtitle"] as? String ?? "",
                tag: o["tag"] as? String ?? String(i)))
        }
        if items.isEmpty { call.reject("Empty queue"); return }
        let start = call.getInt("startIndex") ?? 0
        let startPos = call.getDouble("startPositionMs") ?? 0
        let pause = call.getDouble("pauseMs") ?? 0
        let loop = call.getBool("loop") ?? false
        let rate = Float(call.getDouble("rate") ?? 1)
        let autoplay = call.getBool("autoplay") ?? true
        DispatchQueue.main.async {
            self.engine.setQueue(items, startIndex: start, startPositionMs: startPos, pauseBetweenMs: pause, loopQueue: loop, rate: rate, autoplay: autoplay)
            call.resolve()
        }
    }

    @objc func play(_ call: CAPPluginCall) { DispatchQueue.main.async { self.engine.play(); call.resolve() } }
    @objc func pause(_ call: CAPPluginCall) { DispatchQueue.main.async { self.engine.pause(); call.resolve() } }
    @objc func stop(_ call: CAPPluginCall) { DispatchQueue.main.async { self.engine.stop(); call.resolve() } }

    @objc func seekToItem(_ call: CAPPluginCall) {
        let i = call.getInt("index") ?? 0
        let pos = call.getDouble("positionMs") ?? 0
        DispatchQueue.main.async { self.engine.seekToItem(i, positionMs: pos); call.resolve() }
    }

    @objc func setRate(_ call: CAPPluginCall) {
        let r = Float(call.getDouble("rate") ?? 1)
        DispatchQueue.main.async { self.engine.setRate(r); call.resolve() }
    }

    @objc func setSleepTimer(_ call: CAPPluginCall) {
        let minutes = call.getDouble("minutes") ?? -1
        let fade = call.getDouble("fadeMs") ?? 8000
        DispatchQueue.main.async { self.engine.setSleepTimer(minutes: minutes, fadeOutMs: fade); call.resolve() }
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let e = self.engine
            var r: [String: Any] = [
                "index": e.index,
                "positionMs": e.positionMs,
                "playing": e.isPlaying,
                "count": e.count,
                "sleepRemainingMs": e.sleepRemainingMs,
            ]
            if let tag = e.tag(at: e.index) { r["tag"] = tag }
            call.resolve(r)
        }
    }
}
