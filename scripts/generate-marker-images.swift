#!/usr/bin/env swift
//
// 카테고리별 지도 마커 PNG 생성기 (macOS / AppKit)
//
// 카테고리 색상 원 배경 위에 이모지를 중앙 렌더링한 240x240 PNG를 만든다.
// 이모지/색상 값은 constants/categories.ts 와 반드시 동기화할 것.
//
// 사용법:
//   swift scripts/generate-marker-images.swift <출력_디렉토리> [filled|plate]
//   (인자 생략 시 현재 디렉토리 / filled 스타일)
//
//   filled: 카테고리 색 원 + 이모지 직접 (기존 룩)
//   plate : 카테고리 색 링 + 흰 속 원 + 이모지 (어떤 배경에서도 선명)
//
import AppKit
import Foundation

struct Marker {
  let name: String   // 파일명 (PlaceCategory 키)
  let emoji: String
  let hex: String    // 배경 원 색상
}

// constants/categories.ts 와 동기화
let markers = [
  Marker(name: "cafe", emoji: "\u{2615}", hex: "A16207"),          // ☕
  Marker(name: "restaurant", emoji: "\u{1F37D}\u{FE0F}", hex: "EF4444"), // 🍽️
  Marker(name: "rest_stop", emoji: "\u{1F17F}\u{FE0F}", hex: "3B82F6"),  // 🅿️
  Marker(name: "gas_station", emoji: "\u{26FD}", hex: "22C55E"),   // ⛽
  Marker(name: "repair_shop", emoji: "\u{1F3CD}\u{FE0F}", hex: "8B5CF6"), // 🏍️
  Marker(name: "viewpoint", emoji: "\u{1F4F8}", hex: "EC4899"),    // 📸
  Marker(name: "gear_shop", emoji: "\u{1F9E4}", hex: "0EA5E9"),    // 🧤
]

let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : FileManager.default.currentDirectoryPath
let style = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "filled"
let dimension = 240
let size = CGFloat(dimension)

func color(fromHex hex: String) -> NSColor {
  var value: UInt64 = 0
  Scanner(string: hex).scanHexInt64(&value)
  return NSColor(
    red: CGFloat((value >> 16) & 0xFF) / 255,
    green: CGFloat((value >> 8) & 0xFF) / 255,
    blue: CGFloat(value & 0xFF) / 255,
    alpha: 1
  )
}

for marker in markers {
  guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: dimension,
    pixelsHigh: dimension,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ) else { continue }

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

  // 색상 원 배경
  let inset: CGFloat = 8
  let circleRect = NSRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2)
  color(fromHex: marker.hex).setFill()
  NSBezierPath(ovalIn: circleRect).fill()

  // 이모지가 놓일 안쪽 영역 (plate 스타일이면 흰 속 원을 한 겹 더 깐다)
  var innerDiameter = size - inset * 2
  if style == "plate" {
    let ringWidth: CGFloat = 22
    let plateInset = inset + ringWidth
    let plateRect = NSRect(x: plateInset, y: plateInset, width: size - plateInset * 2, height: size - plateInset * 2)
    NSColor.white.setFill()
    NSBezierPath(ovalIn: plateRect).fill()
    innerDiameter = size - plateInset * 2
  }

  // 중앙 이모지
  let fontSize = innerDiameter * (style == "plate" ? 0.62 : 0.56)
  let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: fontSize)]
  let str = NSAttributedString(string: marker.emoji, attributes: attrs)
  let textSize = str.size()
  str.draw(at: NSPoint(x: (size - textSize.width) / 2, y: (size - textSize.height) / 2))

  NSGraphicsContext.restoreGraphicsState()

  guard let png = rep.representation(using: .png, properties: [:]) else {
    FileHandle.standardError.write("FAIL \(marker.name)\n".data(using: .utf8)!)
    continue
  }
  let url = URL(fileURLWithPath: outDir).appendingPathComponent("\(marker.name).png")
  do {
    try png.write(to: url)
    print("OK  \(marker.name).png")
  } catch {
    FileHandle.standardError.write("WRITE FAIL \(marker.name): \(error)\n".data(using: .utf8)!)
  }
}
