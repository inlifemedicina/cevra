import Foundation
import CoreGraphics
import AVFoundation
import ImageIO
import UniformTypeIdentifiers

// Closed experimental SDR path. Native profile stays local; no OS profile is redistributed.
enum PreviewError: Error { case invalid, profile, output }
func run() throws {
 let a=CommandLine.arguments
 guard a.count==4,!FileManager.default.fileExists(atPath:a[3]),
       let source=CGImageSourceCreateWithURL(URL(fileURLWithPath:a[1]) as CFURL,nil),
       let raster=CGImageSourceCreateImageAtIndex(source,0,nil),raster.width==1920,raster.height==1080 else {throw PreviewError.invalid}
 let generator=AVAssetImageGenerator(asset:AVURLAsset(url:URL(fileURLWithPath:a[2])))
 generator.appliesPreferredTrackTransform=false
 generator.apertureMode = .encodedPixels
 generator.requestedTimeToleranceBefore = .zero;generator.requestedTimeToleranceAfter = .zero
 let sample=try generator.copyCGImage(at:.zero,actualTime:nil)
 guard let profile=sample.colorSpace,profile.name as String? == "kCGColorSpaceCoreMedia709",
       let tagged=raster.copy(colorSpace:profile),let ctx=CGContext(data:nil,width:1920,height:1080,bitsPerComponent:8,bytesPerRow:7680,
       space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else {throw PreviewError.profile}
 ctx.clear(CGRect(x:0,y:0,width:1920,height:1080));ctx.interpolationQuality = .none
 ctx.draw(tagged,in:CGRect(x:0,y:0,width:1920,height:1080))
 guard let image=ctx.makeImage(),let dest=CGImageDestinationCreateWithURL(URL(fileURLWithPath:a[3]) as CFURL,UTType.png.identifier as CFString,1,nil) else {throw PreviewError.output}
 CGImageDestinationAddImage(dest,image,nil);guard CGImageDestinationFinalize(dest) else {throw PreviewError.output}
 print("kCGColorSpaceCoreMedia709")
}
do{try run()}catch{fputs("MANUAL_TITLE_PREVIEW_FAILED: \(error)\n",stderr);exit(1)}
