import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { IpAddresses, Port, PublicSubnet, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Service } from 'aws-cdk-lib/aws-servicediscovery';
import { ContainerDefinition } from 'aws-cdk-lib/aws-ecs';

// all resources should be tagged accordingly

// also I would concider creating different .ts files for each resource sets for better management

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    // Create VPC
    const vpc = new ec2.Vpc(this, 'TestAppVPC', {
      ipAddresses: IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public01',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Public02',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private01',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Private02',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // Create Internet Gateway
    const igw = new ec2.CfnInternetGateway(this, 'TestAppInternetGateway');

    // Attach Internet Gateway to VPC
    const vpcAttachment = new ec2.CfnVPCGatewayAttachment(this, 'TestAppVPCGatewayAttachment', {
      vpcId: vpc.vpcId,
      internetGatewayId: igw.ref,
    });    
    
    // Create NAT Gateway
    const ngw = new ec2.CfnNatGateway(this, 'TestAppNATGateway', {
      subnetId: vpc.publicSubnets[0].subnetId,
      allocationId: new ec2.CfnEIP(this, 'TestAppNATEIP').attrAllocationId,
    });

    // Create Route Tables
    const publicRouteTable = new ec2.CfnRouteTable(this, 'TestAppPublicRouteTable', {
      vpcId: vpc.vpcId,
    });
    const privateRouteTable = new ec2.CfnRouteTable(this, 'TestAppPrivateRouteTable', {
      vpcId: vpc.vpcId,
    });

    // Add routes to Route Tables
    new ec2.CfnRoute(this, 'TestAppPublicRoute', {
      routeTableId: publicRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: igw.ref,
    });
    new ec2.CfnRoute(this, 'TestAppPrivateRoute', {
      routeTableId: privateRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      natGatewayId: ngw.ref,
    });

    // Associate Route Tables with Subnets
    vpc.publicSubnets.forEach((subnet, i) => {
      new ec2.CfnSubnetRouteTableAssociation(this, `TestAppPubRTAssociation${i}`, {
        subnetId: subnet.subnetId,
        routeTableId: publicRouteTable.ref,
      });
    });
    vpc.privateSubnets.forEach((subnet, i) => {
      new ec2.CfnSubnetRouteTableAssociation(this, `TestAppPrvRTAssociation${i}`, {
        subnetId: subnet.subnetId,
        routeTableId: privateRouteTable.ref,
      });
    });

    // Create a security group for the ALB
    const albSecurityGroup = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for public ALB',
    });
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP traffic');

    // Create a security group for the ECS 
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'ECSSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for ECS',
    });
    ecsSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(8000), 'Allow HTTP traffic from ALB');

    // Create an Elastic Container Registry (ECR) repository
    const ecrRepository = new ecr.Repository(this, 'matific-django-testapp');    

    // Create an Elastic Container Service (ECS) cluster
    const ecsCluster = new ecs.Cluster(this, 'TestAppECSCluster', {
      vpc: vpc,
      clusterName: 'TestAppECSCluster',
    });

    ecsCluster.connections.allowFrom(ecsSecurityGroup, ec2.Port.allTraffic());

    // Create an ECS task definition
    const taskDefinition = new ecs.TaskDefinition(this, 'TestAppDefinition', {
      compatibility: ecs.Compatibility.FARGATE,
      cpu: '512',
      memoryMiB: '1024',
    });

    // Add a container to the task definition
    const containerDefinition = taskDefinition.addContainer('TestAppContainer', {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepository),
      memoryLimitMiB: 512,
      environment: {
        KEY: 'VALUE',
      },
    });
    containerDefinition.addPortMappings({
      containerPort: 8000,
      hostPort: 8000,
      protocol: ecs.Protocol.TCP,
    });

    // Create an Application Load Balancer
    const publicSubnetSelection = { subnetType: ec2.SubnetType.PUBLIC };
    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'TestAppLoadBalancer', {
      vpc: vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      vpcSubnets: publicSubnetSelection
      
    });

    // Create a listener for the load balancer
    const listener = loadBalancer.addListener('TestAppListener', {
      port: 80,
      open: true,
    }); 

    // Add a service to the ECS cluster
    const ecsService = new ecs.FargateService(this, 'TestAppECSService', {
      cluster: ecsCluster,
      taskDefinition: taskDefinition,
      desiredCount: 2,
      serviceName: 'TestAppECSService',
      securityGroups: [ ecsSecurityGroup ],
      assignPublicIp: false,
      platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
    });
    
    // Create a target group for the load balancer
    const targetGroup = listener.addTargets('TestAppTargetGroup', {
      targets: [ecsService.loadBalancerTarget({
        containerName: 'TestAppContainer',
        containerPort: 8000,
      })],
      healthCheck: {
        path: '/',
      },
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    // Add the load balancer to the service
    ecsService.attachToApplicationTargetGroup(targetGroup);
  }
}
