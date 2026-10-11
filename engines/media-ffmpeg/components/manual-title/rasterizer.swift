import Foundation
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers

// First-party fixed title component; private font loading, no global registration.
enum RasterError: Error { case invalidArguments, font, glyph, overflow, output }
func rasterize() throws {
let args = CommandLine.arguments
guard (args.count == 6 || args.count == 10), let width = Int(args[2]), let height = Int(args[3]),
      [(1920,1080),(1080,1920)].contains(where: { $0.0 == width && $0.1 == height }),
      !FileManager.default.fileExists(atPath: args.last!) else { throw RasterError.invalidArguments }
let values = args.count == 10 ? Array(args[5...8]).compactMap(Double.init) : [0.08, 0, 0.84, 1]
guard values.count == 4, values.allSatisfy({ $0.isFinite }), values[0] >= 0, values[1] >= 0,
      values[2] >= 0.2, values[2] <= 1, values[3] >= 0.5, values[3] <= 2,
      values[0] + values[2] <= 1 + 1e-9 else { throw RasterError.invalidArguments }
let fontSize: Double = (width == 1920 ? 56 : 48) * values[3]
let text = args[4]
guard !text.isEmpty && text.utf16.count <= 80 else { throw RasterError.invalidArguments }
let fontURL = URL(fileURLWithPath: args[1])
guard let provider = CGDataProvider(url: fontURL as CFURL), let graphicsFont = CGFont(provider),
      (graphicsFont.fullName as String?)?.hasPrefix("Inter") == true else { throw RasterError.font }
let baseFont = CTFontCreateWithGraphicsFont(graphicsFont, CGFloat(fontSize), nil, nil)
let fontAttributes = [kCTFontCascadeListAttribute: []] as CFDictionary
let font = CTFontCreateCopyWithAttributes(baseFont, CGFloat(fontSize), nil,
    CTFontDescriptorCreateWithAttributes(fontAttributes))
// Keep the canonical text intact. Drawing stays within the private Inter face:
// normalize each grapheme, use its text presentation, and mark missing clusters visibly.
func covered(_ value: String) -> Bool {
    let chars = Array(value.utf16)
    var glyphs = [CGGlyph](repeating: 0, count: chars.count)
    return !chars.isEmpty && CTFontGetGlyphsForCharacters(font, chars, &glyphs, chars.count) && !glyphs.contains(0)
}
let missingMarker = "□"
guard covered(missingMarker) else { throw RasterError.font }
var drawnText = "", substitutedClusters = 0, presentationSelectorsRemoved = 0
for character in text {
    let cluster = String(character)
    presentationSelectorsRemoved += cluster.unicodeScalars.filter { $0.value == 0xFE0E || $0.value == 0xFE0F }.count
    let textStyle = String(String.UnicodeScalarView(cluster.unicodeScalars.filter {
        $0.value != 0xFE0E && $0.value != 0xFE0F
    })).precomposedStringWithCanonicalMapping
    if covered(textStyle) { drawnText += textStyle }
    else { drawnText += missingMarker; substitutedClusters += 1 }
}
guard let space = CGColorSpace(name: CGColorSpace.sRGB), let context = CGContext(data: nil,
    width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
    space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { throw RasterError.output }
context.clear(CGRect(x: 0, y: 0, width: width, height: height))
let barHeight = CGFloat(fontSize) * 1.9
let x = CGFloat(width) * values[0]
let y = args.count == 10 ? CGFloat(height) * (1 - values[1]) - barHeight : CGFloat(height) * 0.10
guard y >= -1e-6 else { throw RasterError.invalidArguments }
let barWidth = CGFloat(width) * values[2], padding = CGFloat(fontSize) * 0.7
let bar = CGRect(x: x, y: y, width: barWidth, height: barHeight)
context.setFillColor(CGColor(srgbRed: 0.10, green: 0.12, blue: 0.16, alpha: 1))
context.fill(bar)
context.setFillColor(CGColor(srgbRed: 0.43, green: 0.62, blue: 0.72, alpha: 1))
context.fill(CGRect(x: x, y: y, width: 6 * values[3], height: barHeight))
let attributed = NSAttributedString(string: drawnText, attributes: [
    NSAttributedString.Key(kCTFontAttributeName as String): font,
    NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(srgbRed: 0.96, green: 0.97, blue: 0.98, alpha: 1)
])
let line = CTLineCreateWithAttributedString(attributed)
// Shaping must still use the private Inter font, with every resulting glyph present.
let runs = CTLineGetGlyphRuns(line) as NSArray
for raw in runs {
    let run = raw as! CTRun
    let attributes = CTRunGetAttributes(run) as NSDictionary
    guard let runFont = attributes[kCTFontAttributeName] else { throw RasterError.glyph }
    let shapedFont = runFont as! CTFont
    guard CFEqual(CTFontCopyPostScriptName(shapedFont), CTFontCopyPostScriptName(font)) else { throw RasterError.glyph }
    var shapedGlyphs = [CGGlyph](repeating: 0, count: CTRunGetGlyphCount(run))
    CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &shapedGlyphs)
    guard !shapedGlyphs.contains(0) else { throw RasterError.glyph }
}
let bounds = CTLineGetBoundsWithOptions(line, [.useGlyphPathBounds])
guard bounds.width <= barWidth - 2 * padding, bounds.height <= barHeight - 12 else { throw RasterError.overflow }
let origin = CGPoint(x: x + padding - bounds.minX, y: y + (barHeight - bounds.height) / 2 - bounds.minY)
context.textPosition = origin
CTLineDraw(line, context)
guard let image = context.makeImage(), let destination = CGImageDestinationCreateWithURL(
    URL(fileURLWithPath: args.last!) as CFURL, UTType.png.identifier as CFString, 1, nil) else { throw RasterError.output }
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else { throw RasterError.output }
let report: [String: Any] = ["width": width,"height":height,"text":text,"fontPostScriptName":CTFontCopyPostScriptName(font),
    "allGlyphsAvailable":substitutedClusters == 0,"renderedGlyphsAvailable":true,
    "renderedText":drawnText,"substitutedClusters":substitutedClusters,
    "presentationSelectorsRemoved":presentationSelectorsRemoved,"missingGlyphMarker":missingMarker,
    "globalFontRegistration":false,"fontSize":fontSize,
    "barTopLeft":[Double(x),Double(CGFloat(height)-y-barHeight),Double(barWidth),Double(barHeight)],
    "glyphBounds":[Double(bounds.minX),Double(bounds.minY),Double(bounds.width),Double(bounds.height)]]
let json = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
FileHandle.standardOutput.write(json)
FileHandle.standardOutput.write(Data([10]))

}
do { try rasterize() } catch {
    FileHandle.standardError.write(Data("MANUAL_TITLE_RASTER_FAILED: \(error)\n".utf8))
    exit(1)
}
