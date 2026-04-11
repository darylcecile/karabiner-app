#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>

static NSString *const kElectrobunVibrancyViewIdentifier =
	@"ElectrobunVibrancyView";
static NSString *const kElectrobunNativeDragViewIdentifier =
	@"ElectrobunNativeDragView";
static const void *kElectrobunTrafficLightControllerKey =
	&kElectrobunTrafficLightControllerKey;

@interface ElectrobunNativeDragView : NSView
@end

@implementation ElectrobunNativeDragView
- (BOOL)isOpaque {
	return NO;
}

- (void)drawRect:(NSRect)dirtyRect {
	(void)dirtyRect;
}

- (void)mouseDown:(NSEvent *)event {
	NSWindow *window = [self window];
	if (window != nil && event != nil) {
		[window performWindowDragWithEvent:event];
	}
}
@end

static NSVisualEffectView *findVibrancyView(NSView *contentView) {
	for (NSView *subview in [contentView subviews]) {
		if ([subview isKindOfClass:[NSVisualEffectView class]] &&
			[[subview identifier]
				isEqualToString:kElectrobunVibrancyViewIdentifier]) {
			return (NSVisualEffectView *)subview;
		}
	}

	return nil;
}

static ElectrobunNativeDragView *findNativeDragView(NSView *contentView) {
	for (NSView *subview in [contentView subviews]) {
		if ([subview isKindOfClass:[ElectrobunNativeDragView class]] &&
			[[subview identifier]
				isEqualToString:kElectrobunNativeDragViewIdentifier]) {
			return (ElectrobunNativeDragView *)subview;
		}
	}

	return nil;
}

static void refreshWindowButtonInteraction(NSWindow *window,
											 NSArray<NSButton *> *buttons,
											 NSView *buttonContainer) {
	for (NSButton *button in buttons) {
		[button setNeedsDisplay:YES];
		[button updateTrackingAreas];
	}

	[buttonContainer setNeedsDisplay:YES];
	[buttonContainer setNeedsLayout:YES];
	[buttonContainer layoutSubtreeIfNeeded];
	[buttonContainer updateTrackingAreas];

	NSView *contentView = [window contentView];
	if (contentView != nil) {
		[contentView setNeedsDisplay:YES];
		[contentView updateTrackingAreas];
		[window invalidateCursorRectsForView:contentView];
	}

	[window invalidateCursorRectsForView:buttonContainer];
	[window displayIfNeeded];
}

static void normalizeWindowButtonAppearance(NSArray<NSButton *> *buttons) {
	for (NSButton *button in buttons) {
		NSButtonCell *cell = [button cell];
		if (cell != nil) {
			[cell setControlSize:NSControlSizeRegular];
		}
		[button setNeedsDisplay:YES];
	}
}

static BOOL applyTrafficLightLayout(NSWindow *window, CGFloat x, CGFloat yFromTop) {
	NSButton *closeButton = [window standardWindowButton:NSWindowCloseButton];
	NSButton *minimizeButton =
		[window standardWindowButton:NSWindowMiniaturizeButton];
	NSButton *zoomButton = [window standardWindowButton:NSWindowZoomButton];

	if (closeButton == nil || minimizeButton == nil || zoomButton == nil) {
		return NO;
	}

	NSView *buttonContainer = [closeButton superview];
	if (buttonContainer == nil) {
		return NO;
	}

	NSView *containerParent = [buttonContainer superview];
	if (containerParent == nil) {
		return NO;
	}

	NSRect closeFrameInParent =
		[buttonContainer convertRect:[closeButton frame] toView:containerParent];
	BOOL flipped = [containerParent isFlipped];
	CGFloat targetY = yFromTop;
	if (!flipped) {
		targetY = containerParent.frame.size.height - yFromTop -
				  closeButton.frame.size.height;
	}
	targetY = MAX(0.0, targetY);

	NSArray<NSButton *> *buttons = @[ closeButton, minimizeButton, zoomButton ];
	normalizeWindowButtonAppearance(buttons);

	NSRect containerFrame = [buttonContainer frame];
	containerFrame.origin.x += x - NSMinX(closeFrameInParent);
	containerFrame.origin.y += targetY - NSMinY(closeFrameInParent);
	[buttonContainer setFrame:containerFrame];

	refreshWindowButtonInteraction(window, buttons, buttonContainer);
	[window invalidateShadow];
	return YES;
}

@interface ElectrobunTrafficLightController : NSObject
@property(nonatomic, weak) NSWindow *window;
@property(nonatomic) CGFloat x;
@property(nonatomic) CGFloat yFromTop;
- (instancetype)initWithWindow:(NSWindow *)window;
- (void)updateWithX:(CGFloat)x yFromTop:(CGFloat)yFromTop;
- (BOOL)applyLayout;
@end

@implementation ElectrobunTrafficLightController
- (instancetype)initWithWindow:(NSWindow *)window {
	self = [super init];
	if (self == nil) {
		return nil;
	}

	_window = window;
	NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
	[center addObserver:self
			   selector:@selector(handleWindowLayoutChange:)
				   name:NSWindowDidResizeNotification
				 object:window];
	[center addObserver:self
			   selector:@selector(handleWindowLayoutChange:)
				   name:NSWindowDidEndLiveResizeNotification
				 object:window];
	[center addObserver:self
			   selector:@selector(handleWindowLayoutChange:)
				   name:NSWindowDidBecomeKeyNotification
				 object:window];
	return self;
}

- (void)dealloc {
	[[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (void)updateWithX:(CGFloat)x yFromTop:(CGFloat)yFromTop {
	self.x = x;
	self.yFromTop = yFromTop;
}

- (void)handleWindowLayoutChange:(NSNotification *)notification {
	(void)notification;
	[self applyLayout];
}

- (BOOL)applyLayout {
	NSWindow *window = self.window;
	if (window == nil) {
		return NO;
	}

	return applyTrafficLightLayout(window, self.x, self.yFromTop);
}
@end

extern "C" bool enableWindowVibrancy(void *windowPtr) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}

		[window setOpaque:NO];
		[window setBackgroundColor:[NSColor clearColor]];
		[window setTitlebarAppearsTransparent:YES];
		[window setHasShadow:YES];

		NSView *contentView = [window contentView];
		if (contentView == nil) {
			return;
		}

		NSVisualEffectView *effectView = findVibrancyView(contentView);

		if (effectView == nil) {
			effectView = [[NSVisualEffectView alloc]
				initWithFrame:[contentView bounds]];
			[effectView setIdentifier:kElectrobunVibrancyViewIdentifier];
			[effectView
				setAutoresizingMask:(NSViewWidthSizable | NSViewHeightSizable)];
		}

		if (@available(macOS 10.14, *)) {
			[effectView setMaterial:NSVisualEffectMaterialUnderWindowBackground];
		} else {
			[effectView setMaterial:NSVisualEffectMaterialSidebar];
		}
		[effectView setBlendingMode:NSVisualEffectBlendingModeBehindWindow];
		[effectView setState:NSVisualEffectStateActive];

		if ([effectView superview] == nil) {
			NSView *relativeView = [[contentView subviews] firstObject];
			if (relativeView != nil) {
				[contentView addSubview:effectView
							 positioned:NSWindowBelow
							 relativeTo:relativeView];
			} else {
				[contentView addSubview:effectView];
			}
		}

		[window invalidateShadow];
		success = YES;
	});

	return success;
}

extern "C" bool ensureWindowShadow(void *windowPtr) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}

		[window setHasShadow:YES];
		[window invalidateShadow];
		success = YES;
	});

	return success;
}

extern "C" bool setWindowTrafficLightsPosition(void *windowPtr, double x,
											   double yFromTop) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}

		ElectrobunTrafficLightController *controller =
			objc_getAssociatedObject(window, kElectrobunTrafficLightControllerKey);
		if (controller == nil) {
			controller = [[ElectrobunTrafficLightController alloc] initWithWindow:window];
			objc_setAssociatedObject(
				window,
				kElectrobunTrafficLightControllerKey,
				controller,
				OBJC_ASSOCIATION_RETAIN_NONATOMIC
			);
		}

		[controller updateWithX:x yFromTop:yFromTop];
		success = [controller applyLayout];
	});

	return success;
}

extern "C" bool setNativeWindowDragRegion(void *windowPtr, double x,
										  double height) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}

		NSView *contentView = [window contentView];
		if (contentView == nil) {
			return;
		}

		CGFloat dragX = MAX(0.0, x);
		CGFloat dragHeight = MAX(0.0, height);
		CGFloat dragWidth = MAX(0.0, contentView.bounds.size.width - dragX);
		if (dragHeight <= 0.0 || dragWidth <= 0.0) {
			return;
		}

		BOOL flipped = [contentView isFlipped];
		CGFloat dragY = flipped ? 0.0 : contentView.bounds.size.height - dragHeight;
		dragY = MAX(0.0, dragY);

		ElectrobunNativeDragView *dragView = findNativeDragView(contentView);
		if (dragView == nil) {
			dragView = [[ElectrobunNativeDragView alloc] initWithFrame:NSZeroRect];
			[dragView setIdentifier:kElectrobunNativeDragViewIdentifier];
		}

		[dragView setFrame:NSMakeRect(dragX, dragY, dragWidth, dragHeight)];
		[dragView setAutoresizingMask:NSViewWidthSizable];

		if ([dragView superview] == nil) {
			[contentView addSubview:dragView
						 positioned:NSWindowAbove
						 relativeTo:nil];
		}

		success = YES;
	});

	return success;
}
