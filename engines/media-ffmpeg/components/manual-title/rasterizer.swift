import Foundation
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers

// First-party fixed title component; private font loading, no global registration.
enum RasterError: Error { case invalidArguments, font, glyph, overflow, output }
let args = CommandLine.arguments
guard args.count == 6, let width = Int(args[2]), let height = Int(args[3]),
      [(1920,1080),(1080,1920)].contains(where: { $0.0 == width && $0.1 == height }),
      !FileManager.default.fileExists(atPath: args[5]) else { throw RasterError.invalidArguments }
let fontSize: Double = width == 1920 ? 56 : 48
let text = args[4]
guard !text.isEmpty && text.utf16.count <= 80 else { throw RasterError.invalidArguments }
let fontURL = URL(fileURLWithPath: args[1])
guard let provider = CGDataProvider(url: fontURL as CFURL), let graphicsFont = CGFont(provider),
      (graphicsFont.fullName as String?)?.hasPrefix("Inter") == true else { throw RasterError.font }
let baseFont = CTFontCreateWithGraphicsFont(graphicsFont, CGFloat(fontSize), nil, nil)
let fontAttributes = [kCTFontCascadeListAttribute: []] as CFDictionary
let font = CTFontCreateCopyWithAttributes(baseFont, CGFloat(fontSize), nil,
    CTFontDescriptorCreateWithAttributes(fontAttributes))
let chars = Array(text.utf16)
var glyphs = [CGGlyph](repeating: 0, count: chars.count)
guard CTFontGetGlyphsForCharacters(font, chars, &glyphs, chars.count), !glyphs.contains(0) else { throw RasterError.glyph }
guard let space = CGColorSpace(name: CGColorSpace.sRGB), let context = CGContext(data: nil,
    width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
    space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { throw RasterError.output }
context.clear(CGRect(x: 0, y: 0, width: width, height: height))
let x = CGFloat(width) * 0.08, y = CGFloat(height) * 0.10
let barWidth = CGFloat(width) * 0.84, padding = CGFloat(fontSize) * 0.7
let barHeight = CGFloat(fontSize) * 1.9
let bar = CGRect(x: x, y: y, width: barWidth, height: barHeight)
context.setFillColor(CGColor(srgbRed: 0.10, green: 0.12, blue: 0.16, alpha: 1))
context.fill(bar)
context.setFillColor(CGColor(srgbRed: 0.43, green: 0.62, blue: 0.72, alpha: 1))
context.fill(CGRect(x: x, y: y, width: 6, height: barHeight))
let attributed = NSAttributedString(string: text, attributes: [
    NSAttributedString.Key(kCTFontAttributeName as String): font,
    NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(srgbRed: 0.96, green: 0.97, blue: 0.98, alpha: 1)
])
let line = CTLineCreateWithAttributedString(attributed)
let bounds = CTLineGetBoundsWithOptions(line, [.useGlyphPathBounds])
guard bounds.width <= barWidth - 2 * padding, bounds.height <= barHeight - 12 else { throw RasterError.overflow }
let origin = CGPoint(x: x + padding - bounds.minX, y: y + (barHeight - bounds.height) / 2 - bounds.minY)
context.textPosition = origin
CTLineDraw(line, context)
guard let image = context.makeImage(), let destination = CGImageDestinationCreateWithURL(
    URL(fileURLWithPath: args[5]) as CFURL, UTType.png.identifier as CFString, 1, nil) else { throw RasterError.output }
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else { throw RasterError.output }
let report: [String: Any] = ["width": width,"height":height,"text":text,"fontPostScriptName":CTFontCopyPostScriptName(font),
    "allGlyphsAvailable":true,"globalFontRegistration":false,"fontSize":fontSize,
    "barTopLeft":[Double(x),Double(CGFloat(height)-y-barHeight),Double(barWidth),Double(barHeight)],
    "glyphBounds":[Double(bounds.minX),Double(bounds.minY),Double(bounds.width),Double(bounds.height)]]
let json = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
FileHandle.standardOutput.write(json)
FileHandle.standardOutput.write(Data([10]))
