// Sim Fleet menu-bar icon.
//
// Left click opens the fleet dashboard in the default browser. Right click (or
// Control-click) shows the booted devices and the Claude Code / Codex sessions
// attached to each, read from the fleet's /api/v1/agents endpoint.
//
// Usage: SimFleetTray <dashboard-url> [owner-pid]
// When owner-pid is given, the icon exits once that process (the fleet server) exits.

import AppKit

struct AgentsPayload: Decodable {
  struct Agent: Decodable {
    let kind: String
    let title: String
    let via: String
  }
  struct Device: Decodable {
    let platform: String
    let deviceId: String
    let name: String
    let state: String
    let agents: [Agent]
  }
  let devices: [Device]
}

final class TrayController: NSObject, NSMenuDelegate {
  private let dashboardURL: URL
  private let ownerPid: pid_t?
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  private var devices: [AgentsPayload.Device] = []
  private var reachable = false

  init(dashboardURL: URL, ownerPid: pid_t?) {
    self.dashboardURL = dashboardURL
    self.ownerPid = ownerPid
    super.init()
    if let button = statusItem.button {
      let image = NSImage(systemSymbolName: "iphone.gen3", accessibilityDescription: "Sim Fleet")
      image?.isTemplate = true
      button.image = image
      button.imagePosition = .imageLeading
      button.target = self
      button.action = #selector(handleClick(_:))
      button.sendAction(on: [.leftMouseUp, .rightMouseUp])
      button.setAccessibilityLabel("Sim Fleet")
      button.setAccessibilityHelp("Opens the simulator fleet dashboard")
    }
    refresh()
    Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.refresh() }
  }

  @objc private func handleClick(_ sender: NSStatusBarButton) {
    guard let event = NSApp.currentEvent else { return openDashboard() }
    if event.type == .rightMouseUp || event.modifierFlags.contains(.control) {
      showMenu()
    } else {
      openDashboard()
    }
  }

  @objc private func openDashboard() {
    NSWorkspace.shared.open(dashboardURL)
  }

  @objc private func quit() {
    NSApp.terminate(nil)
  }

  private func showMenu() {
    let menu = NSMenu()
    menu.delegate = self
    let open = NSMenuItem(title: "Open Sim Fleet", action: #selector(openDashboard), keyEquivalent: "o")
    open.target = self
    menu.addItem(open)
    menu.addItem(.separator())

    if !reachable {
      menu.addItem(disabledItem("Fleet server is not reachable"))
    } else {
      let running = devices.filter { $0.state == "Booted" || $0.state == "Booting" }
      if running.isEmpty {
        menu.addItem(disabledItem("No devices running"))
      }
      for device in running {
        let platform = device.platform == "android" ? "Android" : "iOS"
        menu.addItem(disabledItem("\(device.name) · \(platform)", bold: true))
        if device.agents.isEmpty {
          menu.addItem(disabledItem("    No agent attached"))
        }
        for agent in device.agents {
          let kind = agent.kind == "claude" ? "Claude" : agent.kind == "codex" ? "Codex" : agent.kind
          menu.addItem(disabledItem("    \(kind): \(agent.title)"))
        }
      }
    }

    menu.addItem(.separator())
    let quitItem = NSMenuItem(title: "Hide Menu Bar Icon", action: #selector(quit), keyEquivalent: "q")
    quitItem.target = self
    menu.addItem(quitItem)
    statusItem.menu = menu
    statusItem.button?.performClick(nil)
  }

  func menuDidClose(_ menu: NSMenu) {
    // Detach so the next left click opens the browser instead of the menu.
    statusItem.menu = nil
  }

  private func disabledItem(_ title: String, bold: Bool = false) -> NSMenuItem {
    let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
    item.isEnabled = false
    if bold {
      item.attributedTitle = NSAttributedString(
        string: title,
        attributes: [.font: NSFont.menuFont(ofSize: 0).withTraits(.boldFontMask)]
      )
    }
    return item
  }

  private func refresh() {
    if let ownerPid, kill(ownerPid, 0) != 0 {
      NSApp.terminate(nil)
      return
    }
    let url = dashboardURL.appendingPathComponent("api/v1/agents")
    var request = URLRequest(url: url)
    request.timeoutInterval = 4
    URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
      let payload = data.flatMap { try? JSONDecoder().decode(AgentsPayload.self, from: $0) }
      DispatchQueue.main.async {
        guard let self else { return }
        self.reachable = payload != nil && (response as? HTTPURLResponse)?.statusCode == 200
        self.devices = payload?.devices ?? []
        self.updateButton()
      }
    }.resume()
  }

  private func updateButton() {
    guard let button = statusItem.button else { return }
    let running = devices.filter { $0.state == "Booted" }.count
    let attached = devices.filter { $0.state == "Booted" && !$0.agents.isEmpty }.count
    button.title = reachable && running > 0 ? " \(running)" : ""
    button.appearsDisabled = !reachable
    button.toolTip = reachable
      ? "Sim Fleet: \(running) running, \(attached) with an agent attached"
      : "Sim Fleet: server not reachable"
  }
}

extension NSFont {
  func withTraits(_ traits: NSFontTraitMask) -> NSFont {
    NSFontManager.shared.convert(self, toHaveTrait: traits)
  }
}

let arguments = CommandLine.arguments
guard arguments.count >= 2, let url = URL(string: arguments[1]) else {
  FileHandle.standardError.write("usage: SimFleetTray <dashboard-url> [owner-pid]\n".data(using: .utf8)!)
  exit(2)
}
let owner = arguments.count >= 3 ? pid_t(arguments[2]) : nil

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = TrayController(dashboardURL: url, ownerPid: owner)
app.run()
